/**
 * Circuit Breaker Pattern Implementation
 *
 * Like a careful bard avoiding taverns known for bar fights,
 * this pattern prevents repeated calls to failing providers.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Provider is failing, requests are blocked
 * - HALF_OPEN: Testing if provider has recovered
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit (default: 3) */
  failureThreshold: number;
  /** Number of consecutive successes in HALF_OPEN to close circuit (default: 2) */
  successThreshold: number;
  /** Time in ms before transitioning from OPEN to HALF_OPEN (default: 30000) */
  timeout: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly providerId: string;

  constructor(providerId: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.providerId = providerId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a request can be executed through this circuit
   */
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Check if timeout has elapsed to transition to HALF_OPEN
        if (this.lastFailureTime && now - this.lastFailureTime >= this.config.timeout) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        // In HALF_OPEN, allow limited requests to test recovery
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.totalRequests++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        // Reset failure count on success
        this.failures = 0;
        break;

      case CircuitState.HALF_OPEN:
        this.successes++;
        // If we've had enough successes, close the circuit
        if (this.successes >= this.config.successThreshold) {
          this.transitionTo(CircuitState.CLOSED);
        }
        break;

      case CircuitState.OPEN:
        // Shouldn't happen, but handle gracefully
        break;
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.totalRequests++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        this.failures++;
        // If failures exceed threshold, open the circuit
        if (this.failures >= this.config.failureThreshold) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;

      case CircuitState.HALF_OPEN:
        // Any failure in HALF_OPEN opens the circuit immediately
        this.transitionTo(CircuitState.OPEN);
        break;

      case CircuitState.OPEN:
        // Already open, just update timestamp
        break;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check for automatic state transition
    if (this.state === CircuitState.OPEN && this.lastFailureTime) {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.config.timeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
    return this.state;
  }

  /**
   * Get detailed statistics about this circuit
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Get provider ID this circuit is tracking
   */
  getProviderId(): string {
    return this.providerId;
  }

  /**
   * Get time remaining until circuit transitions from OPEN to HALF_OPEN
   * Returns null if circuit is not OPEN
   */
  getTimeUntilRetry(): number | null {
    if (this.state !== CircuitState.OPEN || !this.lastFailureTime) {
      return null;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    const remaining = this.config.timeout - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Manually reset the circuit to CLOSED state
   * Use with caution - typically for admin/recovery scenarios
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Force the circuit to OPEN state
   * Use for maintenance or known issues
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
    this.lastFailureTime = Date.now();
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    // Reset counters on state transition
    if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    } else if (newState === CircuitState.OPEN) {
      this.successes = 0;
    }

    // Log state transition for debugging
    if (oldState !== newState) {
      console.log(
        `[CircuitBreaker] ${this.providerId}: ${oldState} -> ${newState}`
      );
    }
  }
}

/**
 * Global registry of circuit breakers for all providers
 */
export const providerCircuits = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a provider
 */
export function getCircuitBreaker(
  providerId: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  let circuit = providerCircuits.get(providerId);
  if (!circuit) {
    circuit = new CircuitBreaker(providerId, config);
    providerCircuits.set(providerId, circuit);
  }
  return circuit;
}

/**
 * Get all circuit breaker stats
 */
export function getAllCircuitStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  for (const [providerId, circuit] of providerCircuits) {
    stats[providerId] = circuit.getStats();
  }
  return stats;
}

/**
 * Execute a function with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
  providerId: string,
  fn: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const circuit = getCircuitBreaker(providerId, config);

  if (!circuit.canExecute()) {
    throw new CircuitBreakerOpenError(providerId, circuit.getTimeUntilRetry());
  }

  try {
    const result = await fn();
    circuit.recordSuccess();
    return result;
  } catch (error) {
    circuit.recordFailure();
    throw error;
  }
}

/**
 * Custom error for when circuit is open
 */
export class CircuitBreakerOpenError extends Error {
  public readonly providerId: string;
  public readonly retryAfter: number | null;

  constructor(providerId: string, retryAfter: number | null) {
    super(`Circuit breaker is OPEN for provider: ${providerId}`);
    this.name = 'CircuitBreakerOpenError';
    this.providerId = providerId;
    this.retryAfter = retryAfter;
  }
}
