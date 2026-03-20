import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();
    
    // Check if user exists
    const { data: existingUser } = await supabase.from('auth_users').select('id').eq('email', email).single();
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert new user
    const { data: user, error } = await supabase.from('auth_users')
      .insert([{ email, password_hash, name }])
      .select()
      .single();

    if (error || !user) throw new Error('Failed to create user');

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'supersecret', { expiresIn: '7d' });

    return NextResponse.json({ token, user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
