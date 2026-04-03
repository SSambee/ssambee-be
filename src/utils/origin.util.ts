const COMMON_DEV_FRONT_PORTS = [3000, 3001] as const;

const normalizeOrigin = (value: string): string | null => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch (_error) {
    return null;
  }
};

export const parseOriginList = (
  ...values: Array<string | undefined>
): string[] => {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value?.split(',') ?? [])
        .map((value) => normalizeOrigin(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
};

export const getConfiguredFrontendOrigins = ({
  frontUrl,
  adminFrontUrl,
}: {
  frontUrl?: string;
  adminFrontUrl?: string;
}): string[] => {
  return parseOriginList(frontUrl, adminFrontUrl);
};

export const getAdminPortalBaseUrl = ({
  frontUrl,
  adminFrontUrl,
}: {
  frontUrl?: string;
  adminFrontUrl?: string;
}): string | null => {
  return parseOriginList(adminFrontUrl, frontUrl)[0] ?? null;
};

export const getDevelopmentTrustedOrigins = (request: Request): string[] => {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  const host = forwardedHost || request.headers.get('host') || requestUrl.host;
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '');

  const localOrigins = COMMON_DEV_FRONT_PORTS.flatMap((port) => [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);

  if (!host) {
    return Array.from(new Set(localOrigins));
  }

  try {
    const apiOrigin = new URL(`${protocol}://${host}`);
    const sameHostOrigins = COMMON_DEV_FRONT_PORTS.map((port) => {
      return `${apiOrigin.protocol}//${apiOrigin.hostname}:${port}`;
    });

    return Array.from(new Set([...localOrigins, ...sameHostOrigins]));
  } catch (_error) {
    return Array.from(new Set(localOrigins));
  }
};
