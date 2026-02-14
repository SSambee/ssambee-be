import { sendSystemMetrics } from './monitor.util.js';
import os from 'node:os';
import { config } from '../config/env.config.js';

// Mock os module
jest.mock('node:os');
// Mock config and isTest
jest.mock('../config/env.config.js', () => ({
  config: {
    LAMBDA_URL: 'http://mock-lambda.url',
  },
  isTest: jest.fn().mockReturnValue(false),
}));

describe('Monitor Utility - @unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock global fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  it('should collect metrics and send them via fetch when LAMBDA_URL is set', async () => {
    // Arrange
    (os.totalmem as jest.Mock).mockReturnValue(1000);
    (os.freemem as jest.Mock).mockReturnValue(200);
    (os.loadavg as jest.Mock).mockReturnValue([0.5, 0.4, 0.3]);
    (os.uptime as jest.Mock).mockReturnValue(3600);

    // Act
    await sendSystemMetrics();

    // Assert
    expect(global.fetch).toHaveBeenCalledWith(
      'http://mock-lambda.url',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
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
      })
    );
  });

  it('should not send metrics if LAMBDA_URL is not set', async () => {
    // Arrange
    const { config } = await import('../config/env.config.js');
    const originalUrl = config.LAMBDA_URL;
    (config as any).LAMBDA_URL = undefined;

    // Act
    await sendSystemMetrics();

    // Assert
    expect(global.fetch).not.toHaveBeenCalled();

    // Cleanup
    (config as any).LAMBDA_URL = originalUrl;
  });
});
