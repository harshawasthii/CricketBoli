import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  email: string;
}

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret') as AuthUser;
    
    return decoded;
  } catch (error) {
    return null;
  }
}
