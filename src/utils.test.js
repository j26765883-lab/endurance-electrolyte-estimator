import { describe, it, expect } from 'vitest';
import { getParam } from './utils.js';

describe('URL Parameter Parsing', () => {
  it('extracts a parameter when it exists', () => {
    const mockURL = '?w=190&sr=1.2';
    expect(getParam(mockURL, 'w', 180)).toBe('190');
    expect(getParam(mockURL, 'sr', 0.8)).toBe('1.2');
  });

  it('returns the default value when the parameter is missing', () => {
    const mockURL = '?w=190';
    // 'd' (duration) is missing, should return default 24
    expect(getParam(mockURL, 'd', 24)).toBe(24); 
  });

  it('handles empty parameters gracefully', () => {
    const mockURL = '?w=&d=24';
    // If the parameter is there but empty, it technically returns an empty string
    expect(getParam(mockURL, 'w', 180)).toBe(''); 
  });
});