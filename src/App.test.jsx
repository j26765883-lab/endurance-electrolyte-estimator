// src/App.test.jsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import App from './App.jsx';

describe('App Component Smoke Test', () => {
  it('renders without crashing', () => {
    // If there's any fatal runtime errors,
    // this render function will throw an error and fail the test.
    expect(() => render(<App />)).not.toThrow();
  });
});