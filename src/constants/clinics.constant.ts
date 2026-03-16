export const ClinicStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  COMPLETED: 'COMPLETED',
} as const;

export type ClinicStatus = (typeof ClinicStatus)[keyof typeof ClinicStatus];
