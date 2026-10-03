import {createRoot} from 'react-dom/client';
import {Component, type ReactNode} from 'react';
import App from './App';
import './styles.css';
class ErrorBoundary extends Component<{children: ReactNode}, {error: string}> {
  state = {error: ''};
  static getDerivedStateFromError(error: Error) {
    return {error: error.message};
  }
  render() {
    return this.state.error ? (
      <main className="page-body">
        <h1>Relution Policy Studio could not render this view</h1>
        <p role="alert">{this.state.error}</p>
        <button onClick={() => location.reload()}>Reload saved state</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
