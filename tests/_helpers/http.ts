/** Build RFC-7231 HTTP-date like: "Wed, 21 Oct 2015 07:28:00 GMT" */
export function rfc7231Date(epochMs: number): string {
  return new Date(epochMs).toUTCString();
}
