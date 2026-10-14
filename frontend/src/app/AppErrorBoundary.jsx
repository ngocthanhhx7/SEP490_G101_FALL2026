import { Component } from 'react';

export class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main role="alert">
      <h1>Không thể hiển thị trang</h1>
      <p>Vui lòng tải lại trang để thử lại.</p>
      <button onClick={() => window.location.reload()}>Tải lại trang</button>
    </main>;
    return this.props.children;
  }
}
