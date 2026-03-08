export const Action = {
  Create: 'create',
  Read: 'read',
  Update: 'update',
  Delete: 'delete',
  UpdateStatus: 'updateStatus',
  List: 'list',
  Manage: 'manage',
} as const;

export type Action = (typeof Action)[keyof typeof Action];
