import { Component, type ErrorInfo, type ReactNode } from "react";

import { ServerErrorPage } from "../../features/shared/StatusPages";

interface Props {
  /** Changes on navigation, so leaving a broken page clears the error. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: string;
  attempt: number;
}

/** One per route outlet: a crash shows the 500 page inside the shell, with retry. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn("Route crashed", error, info.componentStack);
  }

  private retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    if (this.state.error) return <ServerErrorPage onRetry={this.retry} />;
    return <div key={this.state.attempt} className="contents">{this.props.children}</div>;
  }
}
