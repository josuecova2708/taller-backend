export interface DiagnosisInput {
  vehicleInfo: {
    vin?: string;
    make?: string;
    model?: string;
    year?: number;
  };
  dtcCodes: {
    code: string;
    type: string;
    monitorStatus: string;
  }[];
  batteryVoltage?: number;
  previousCodes?: string[];
}

export interface DiagnosisOutput {
  summary: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendations: string[];
  correlations?: string;
}

export interface AiProvider {
  diagnose(input: DiagnosisInput): Promise<DiagnosisOutput>;
  getProviderName(): string;
}
