import { sendSystemMetrics } from './monitor.util.js';
import os from 'node:os';

jest.mock('node:os');
jest.mock('../config/env.config.js', () => ({
  config: {
    ALARM_LAMBDA_URL: 'http://mock-lambda.url',
    ENVIRONMENT: 'development',
  },
  isTest: jest.fn().mockReturnValue(false),
  isDevelopment: jest.fn().mockReturnValue(true),
}));

describe('Monitor Utility - @unit', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should collect metrics and send them via fetch when ALARM_LAMBDA is set', async () => {
    (os.totalmem as jest.Mock).mockReturnValue(1000);
    (os.freemem as jest.Mock).mockReturnValue(200);
    (os.loadavg as jest.Mock).mockReturnValue([0.5, 0.4, 0.3]);
    (os.uptime as jest.Mock).mockReturnValue(3600);

    await sendSystemMetrics();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://mock-lambda.url',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body).toEqual(
      expect.objectContaining({
        type: 'SYSTEM_METRIC',
        cpuLoad: 0.5,
        memoryUsage: '80.00', // (1000 - 200) / 1000 * 100
        uptime: 3600,
        timestamp: expect.any(String),
      }),
    );
  });

  it('should not send metrics if LAMBDA_URL is not set', async () => {
    const { config } = await import('../config/env.config.js');
    const originalUrl = config.ALARM_LAMBDA_URL;
    config.ALARM_LAMBDA_URL = undefined;

    await sendSystemMetrics();

    expect(global.fetch).not.toHaveBeenCalled();

    config.ALARM_LAMBDA_URL = originalUrl;
  });
});
