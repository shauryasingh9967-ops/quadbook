export interface AuthUser {
  id: number;
  role: 'admin' | 'faculty' | 'student';
  email: string;
  name: string;
  jti: string;
  exp: number;
}
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      valid: { body?: any; query?: any; params?: any };
    }
  }
}
