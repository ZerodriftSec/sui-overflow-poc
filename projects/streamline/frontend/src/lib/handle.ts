/**
 * Re-exports StreamLine handle helpers from `@streamline/sdk`.
 * App code keeps importing `@/lib/handle`.
 */
export {
  USERNAME_RE,
  RESERVED_USERNAMES,
  suinsDomain,
  suinsBrand,
  suinsConfigured,
  isHexAddress,
  normalizeHandle,
  formatHandle,
  isStreamlineHandle,
  bareHandleFromName,
  enokiNameMatchesSubname,
  formatSuins,
  normalizeReasonMessage,
  type ParsedHandle,
  type NormalizeResult,
} from "@streamline/sdk";
