import type { AnalysisResult, Finding } from './types';

export function generateFallbackAnalysis(terraformCode: string): AnalysisResult {
  const findings: Finding[] = [];
  let estimatedSavings = 0;
  let optimized = terraformCode;

  if (/r6\.4xlarge/i.test(terraformCode) && /db_instance|postgres|mysql/i.test(terraformCode)) {
    findings.push({
      resource: 'alicloud_db_instance.postgres_db',
      issue: 'Overprovisioned high-memory DB class',
      severity: 'critical',
      current: 'pg.r6.4xlarge (≈ $580/mo)',
      recommended: 'pg.g7.large (≈ $75/mo)',
      costSavings: 505,
      rationale:
        "The environment tag is 'dev'. A high-memory pg.r6.4xlarge class is excessive for test workloads. Downgrading to general-purpose pg.g7.large preserves testing capacity and saves ~87%.",
    });
    estimatedSavings += 505;
    optimized = optimized.replace(/instance_class\s*=\s*["']pg\.r6\.4xlarge["']/g, 'instance_class   = "pg.g7.large"');
  }

  if (/ecs\.r6\.4xlarge/i.test(terraformCode)) {
    findings.push({
      resource: 'alicloud_instance.app_server',
      issue: 'Overprovisioned compute node type',
      severity: 'warning',
      current: 'ecs.r6.4xlarge (≈ $490/mo)',
      recommended: 'ecs.g7.large (≈ $68/mo)',
      costSavings: 422,
      rationale:
        "Dev nodes do not require memory-optimized profiles. General-purpose ecs.g7.large fits typical dev CPU usage (<10%) at a fraction of the cost.",
    });
    estimatedSavings += 422;
    optimized = optimized.replace(/instance_type\s*=\s*["']ecs\.r6\.4xlarge["']/g, 'instance_type     = "ecs.g7.large"');
  }

  if (/alicloud_disk|aws_ebs_volume|azurerm_managed_disk/i.test(terraformCode) && !/delete_with_instance|delete_on_termination/i.test(terraformCode)) {
    findings.push({
      resource: 'alicloud_disk.data_disk',
      issue: 'Orphaned storage waste risk',
      severity: 'info',
      current: 'delete_with_instance not set',
      recommended: 'delete_with_instance = true',
      costSavings: 15,
      rationale:
        'Setting delete_with_instance = true guarantees disk volumes are terminated with the instance, eliminating orphaned cloud storage remnants.',
    });
    estimatedSavings += 15;
  }

  if (/0\.0\.0\.0\/0|::\/0/.test(terraformCode) && /22\/22|"22"|port_range\s*=\s*["']22/.test(terraformCode)) {
    findings.push({
      resource: 'security_group_rule.allow_ssh',
      issue: 'Public ingress administrative SSH exposure',
      severity: 'critical',
      current: 'cidr_ip = "0.0.0.0/0"',
      recommended: 'cidr_ip = "10.0.0.0/8"',
      costSavings: 0,
      rationale:
        'Allowing inbound SSH from 0.0.0.0/0 exposes access keys to dictionary scanning. Restrict ingress to a private CIDR, VPN, or bastion.',
    });
    optimized = optimized.replace(/cidr_ip\s*=\s*["']0\.0\.0\.0\/0["']/g, 'cidr_ip           = "10.0.0.0/8" # Locked down to private subnet ingress');
  }

  if (findings.length === 0) {
    return {
      summary:
        'TerraPilot analyzed the HCL code and found no known optimization patterns. Configure QWEN_API_KEY for a full agent-driven analysis with custom tools.',
      estimatedSavings: 0,
      findings: [],
      optimized_terraform: terraformCode,
    };
  }

  return {
    summary: `TerraPilot analyzed the HCL code and located ${findings.length} optimization opportunities, proposing an immediate monthly cost reduction of $${estimatedSavings.toFixed(2)}.`,
    estimatedSavings,
    findings,
    optimized_terraform: optimized,
  };
}
