// Test-only environment. The app itself has no JWT secret fallback and refuses
// to start without JWT_SECRET, so the e2e suite provides a throwaway value.
process.env.JWT_SECRET ??= 'e2e-test-only-jwt-secret';
