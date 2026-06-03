import type { AnalyzeRequest, AnalyzeResponse } from '@/types/report'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function analyzeCompound(
  request: AnalyzeRequest,
  getToken: () => Promise<string | null>
): Promise<AnalyzeResponse> {
  if (!API_URL) {
    throw new ApiError('API URL not configured', 500)
  }

  const token = await getToken()
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  // Only add Authorization header if token is available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    if (response.status === 422) {
      throw new ApiError(
        'Invalid SMILES string. Please check your input and try again.',
        422
      )
    }
    if (response.status === 403) {
      throw new ApiError('Authentication required. Please sign in.', 403)
    }
    throw new ApiError('Analysis failed. Please try again.', response.status)
  }

  return response.json()
}
