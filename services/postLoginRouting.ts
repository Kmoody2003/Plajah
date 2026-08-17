export type PostLoginRoutingInput = {
  isTV: boolean;
  isMobileDevice: boolean;
  shellNextEnabled: boolean;
};

export function resolvePostLoginDefaultView({
  isTV,
  isMobileDevice,
  shellNextEnabled,
}: PostLoginRoutingInput): 'USER_PROFILE' | 'DASHBOARD' | 'MUSIC' | 'ACADEMIA_HOME' | 'DASHBOARD' {
  if (isTV) return 'DASHBOARD';
  if (isMobileDevice) return 'MUSIC';
  if (shellNextEnabled) return 'USER_PROFILE';
  return 'DASHBOARD';
}
