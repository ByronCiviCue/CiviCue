import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthPing, getRows } from '../src/lib/clients/socrata.js';
import { SocrataHttpError } from '../src/lib/http/socrata.js';
import * as socrataProviders from '../src/lib/env-providers/socrata.js';

describe('Socrata Client', () => {
  let fetchSpy: any;
  let headersSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    headersSpy = vi.spyOn(socrataProviders, 'socrataHeadersFor');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    headersSpy.mockRestore();
  });

  describe('healthPing', () => {
    it('should build correct URL and return true for successful response', async () => {
      headersSpy.mockReturnValue({ 'X-App-Token': 'test-token' });
      fetchSpy.mockResolvedValue(new Response('{"results":[]}', { status: 200 }));

      const result = await healthPing('data.sfgov.org');

      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://data.sfgov.org/api/catalog/v1?limit=1',
        {
          headers: {
            Accept: 'application/json',
            'X-App-Token': 'test-token'
          }
        }
      );
    });

    it('should return false for 404 responses', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('Not Found', { status: 404 }));

      const result = await healthPing('invalid.host');

      expect(result).toBe(false);
    });

    it('should throw for 5xx responses', async () => {
      headersSpy.mockReturnValue({});
      const mockResponse = new Response('Server Error', { status: 500 });
      Object.defineProperty(mockResponse, 'url', { value: 'https://test.com' });
      fetchSpy.mockResolvedValue(mockResponse);

      await expect(healthPing('test.com')).rejects.toThrow(SocrataHttpError);
    });
  });

  describe('getRows', () => {
    it('should build URL with dataset ID and no options', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

      await getRows('data.sfgov.org', 'abc-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://data.sfgov.org/resource/abc-123.json',
        {
          headers: {
            Accept: 'application/json'
          }
        }
      );
    });

    it('should serialize defined query options to Socrata parameters', async () => {
      headersSpy.mockReturnValue({ 'X-App-Token': 'test-token' });
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

      await getRows('data.sfgov.org', 'abc-123', {
        limit: 100,
        select: 'id,name',
        where: 'status = "APPROVED"',
        order: 'date DESC',
        offset: 50
      });

      const expectedUrl = 'https://data.sfgov.org/resource/abc-123.json?%24limit=100&%24select=id%2Cname&%24where=status+%3D+%22APPROVED%22&%24order=date+DESC&%24offset=50';
      expect(fetchSpy).toHaveBeenCalledWith(
        expectedUrl,
        {
          headers: {
            Accept: 'application/json',
            'X-App-Token': 'test-token'
          }
        }
      );
    });

    it('should omit undefined options from query parameters', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

      await getRows('data.sfgov.org', 'abc-123', {
        limit: 10,
        select: undefined,
        where: 'active = true'
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://data.sfgov.org/resource/abc-123.json?%24limit=10&%24where=active+%3D+true',
        expect.any(Object)
      );
    });

    it('should return parsed JSON response', async () => {
      const mockData = [{ id: '123', name: 'Test' }];
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(mockData), { status: 200 }));

      const result = await getRows('data.sfgov.org', 'abc-123');

      expect(result).toEqual(mockData);
    });

    it('should throw SocrataHttpError for non-2xx responses', async () => {
      headersSpy.mockReturnValue({});
      const mockResponse = new Response('Bad Request', { status: 400 });
      Object.defineProperty(mockResponse, 'url', { value: 'https://test.com/resource/abc.json' });
      fetchSpy.mockResolvedValue(mockResponse);

      await expect(getRows('test.com', 'abc')).rejects.toThrow(SocrataHttpError);
      await expect(getRows('test.com', 'abc')).rejects.toThrow('Socrata 400: https://test.com/resource/abc.json');
    });
  });
});