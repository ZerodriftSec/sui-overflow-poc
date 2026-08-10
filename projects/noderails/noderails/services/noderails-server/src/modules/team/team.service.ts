import { getDatabaseClient } from '@noderails/database';
import { NotFoundError, AuthorizationError, ConflictError, ValidationError, VALID_PERMISSIONS } from '@noderails/common';
import { createInvite } from './team-auth.service.js';

const MEMBER_SELECT = {
  id: true,
  email: true,
  name: true,
  permissions: true,
  allAppsAccess: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  appAccess: {
    select: {
      id: true,
      appId: true,
      app: { select: { id: true, name: true, environment: true } },
    },
  },
} as const;

// ── List Team Members ──

export async function listMembers(merchantId: string) {
  const db = getDatabaseClient();

  return db.teamMember.findMany({
    where: { merchantId },
    select: MEMBER_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

// ── Add Team Member ──

interface AddMemberInput {
  merchantId: string;
  email: string;
  name?: string;
  permissions: string[];
  allAppsAccess: boolean;
  appIds?: string[];
}

export async function addMember(input: AddMemberInput) {
  const db = getDatabaseClient();

  // Prevent adding yourself
  const owner = await db.merchant.findUnique({ where: { id: input.merchantId }, select: { email: true } });
  if (owner?.email === input.email) {
    throw new ValidationError('Cannot add yourself as a team member');
  }

  // Validate permissions
  const validSet = new Set(VALID_PERMISSIONS as readonly string[]);
  const invalid = input.permissions.filter(p => !validSet.has(p));
  if (invalid.length > 0) {
    throw new ValidationError(`Invalid permissions: ${invalid.join(', ')}`);
  }

  // If not allAppsAccess, must have at least one app
  if (!input.allAppsAccess && (!input.appIds || input.appIds.length === 0)) {
    throw new ValidationError('Must have all-apps access or at least one specific app assigned');
  }

  // Validate that all appIds belong to this merchant
  if (input.appIds && input.appIds.length > 0) {
    const apps = await db.app.findMany({
      where: { id: { in: input.appIds }, merchantId: input.merchantId },
      select: { id: true },
    });
    if (apps.length !== input.appIds.length) {
      throw new AuthorizationError('One or more apps do not belong to this merchant');
    }
  }

  // Check for duplicate
  const existing = await db.teamMember.findUnique({
    where: { merchantId_email: { merchantId: input.merchantId, email: input.email } },
  });
  if (existing) {
    throw new ConflictError('Team member with this email already exists');
  }

  const created = await db.teamMember.create({
    data: {
      merchantId: input.merchantId,
      email: input.email,
      name: input.name ?? null,
      permissions: input.permissions,
      allAppsAccess: input.allAppsAccess,
      status: 'PENDING',
      appAccess: !input.allAppsAccess && input.appIds
        ? { create: input.appIds.map((appId) => ({ appId })) }
        : undefined,
    },
    select: MEMBER_SELECT,
  });

  // Send invite email
  await createInvite(created.id);

  return created;
}

// ── Update Team Member ──

interface UpdateMemberInput {
  merchantId: string;
  memberId: string;
  name?: string;
  permissions?: string[];
  allAppsAccess?: boolean;
  appIds?: string[];
}

export async function updateMember(input: UpdateMemberInput) {
  const db = getDatabaseClient();

  const member = await db.teamMember.findUnique({
    where: { id: input.memberId },
    select: { id: true, merchantId: true, allAppsAccess: true },
  });
  if (!member) {
    throw new NotFoundError('TeamMember', input.memberId);
  }
  if (member.merchantId !== input.merchantId) {
    throw new AuthorizationError('Not your team member');
  }

  // Validate permissions
  if (input.permissions !== undefined) {
    const validSet = new Set(VALID_PERMISSIONS as readonly string[]);
    const invalid = input.permissions.filter(p => !validSet.has(p));
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid permissions: ${invalid.join(', ')}`);
    }
  }

  const newAllApps = input.allAppsAccess ?? member.allAppsAccess;

  // Validate appIds when not using allAppsAccess
  if (!newAllApps && input.appIds !== undefined) {
    if (input.appIds.length === 0) {
      throw new ValidationError('Must have at least one specific app assigned when not using all-apps access');
    }
    const apps = await db.app.findMany({
      where: { id: { in: input.appIds }, merchantId: input.merchantId },
      select: { id: true },
    });
    if (apps.length !== input.appIds.length) {
      throw new AuthorizationError('One or more apps do not belong to this merchant');
    }
  }

  return db.$transaction(async (tx) => {
    // If switching to allAppsAccess, clear specific app entries
    if (input.allAppsAccess === true && !member.allAppsAccess) {
      await tx.teamMemberApp.deleteMany({ where: { teamMemberId: input.memberId } });
    } else if (!newAllApps && input.appIds !== undefined) {
      // Replace app access list
      await tx.teamMemberApp.deleteMany({ where: { teamMemberId: input.memberId } });
      await tx.teamMemberApp.createMany({
        data: input.appIds.map((appId) => ({ teamMemberId: input.memberId, appId })),
      });
    }

    return tx.teamMember.update({
      where: { id: input.memberId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
        ...(input.allAppsAccess !== undefined ? { allAppsAccess: input.allAppsAccess } : {}),
      },
      select: MEMBER_SELECT,
    });
  });
}

// ── Remove Team Member ──

export async function removeMember(merchantId: string, memberId: string) {
  const db = getDatabaseClient();

  const member = await db.teamMember.findUnique({
    where: { id: memberId },
    select: { id: true, merchantId: true },
  });
  if (!member) {
    throw new NotFoundError('TeamMember', memberId);
  }
  if (member.merchantId !== merchantId) {
    throw new AuthorizationError('Not your team member');
  }

  await db.teamMember.delete({ where: { id: memberId } });
}

// ── Get Team Member ──

export async function getMember(merchantId: string, memberId: string) {
  const db = getDatabaseClient();

  const member = await db.teamMember.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      email: true,
      name: true,
      permissions: true,
      allAppsAccess: true,
      status: true,
      merchantId: true,
      createdAt: true,
      updatedAt: true,
      appAccess: {
        select: {
          id: true,
          appId: true,
          app: { select: { id: true, name: true, environment: true } },
        },
      },
    },
  });
  if (!member) {
    throw new NotFoundError('TeamMember', memberId);
  }
  if (member.merchantId !== merchantId) {
    throw new AuthorizationError('Not your team member');
  }

  return member;
}
