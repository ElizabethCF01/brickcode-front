// Absolute dashboard paths. Routes are defined relative under `/dashboard/*`
// (see Dashboard.tsx); links use these absolute helpers to avoid relative-route
// resolution surprises when drilling across siblings.
export const dash = {
  classes: '/dashboard',
  class: (classId: string) => `/dashboard/classes/${classId}`,
  student: (studentId: string) => `/dashboard/students/${studentId}`,
  session: (sessionId: string) => `/dashboard/sessions/${sessionId}`,
}
