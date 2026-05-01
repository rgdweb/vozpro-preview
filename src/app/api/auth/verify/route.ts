import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'

export async function GET() {
  const isAdmin = await getAdminSession()
  return NextResponse.json({ authenticated: isAdmin })
}
