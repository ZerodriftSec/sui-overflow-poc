import type { RiskAssessment } from '../engine/risk-engine.js';

export interface ComplianceReport {
  schemaVersion: 1;
  generatedAt: string;
  assessment: RiskAssessment;
  disclaimer: string;
}

export function buildComplianceReport(assessment: RiskAssessment): ComplianceReport {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    assessment,
    disclaimer:
      'Heuristic risk signals derived from GoldRush indexed data. Not legal, regulatory, or investment advice. Verify independently before decisions.',
  };
}

export function reportToJson(report: ComplianceReport): string {
  return JSON.stringify(report, null, 2);
}
