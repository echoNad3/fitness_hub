export async function timedCloudFetch(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController()
  const source = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const abort = () => controller.abort(source?.reason)
  if (source?.aborted) abort()
  else source?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    // Include body download in the deadline; fetch alone resolves as soon as headers arrive.
    const body = await response.arrayBuffer()
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    })
  } catch (error) {
    if (timedOut) throw new Error('Cloud request timed out. Retry sync.')
    throw error
  } finally {
    clearTimeout(timer)
    source?.removeEventListener('abort', abort)
  }
}
