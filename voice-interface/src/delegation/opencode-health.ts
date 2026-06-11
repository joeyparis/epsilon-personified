export interface OpenCodeHealthChecker {
  isAvailable: (endpoint: string) => Promise<boolean>
}

export const fetchOpenCodeHealthChecker: OpenCodeHealthChecker = {
  async isAvailable(endpoint) {
    try {
      const response = await fetch(endpoint, { method: 'GET' })
      return response.ok || response.status < 500
    } catch {
      return false
    }
  },
}
