export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  roles: string[];
  claims: Record<string, any>;
  token: string;
}
