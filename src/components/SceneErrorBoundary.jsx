import React from 'react';
import { SceneContext } from '../context/SceneContext.jsx';

export default class SceneErrorBoundary extends React.Component {
  static contextType = SceneContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Scene loading error caught by boundary:', error, errorInfo);
    if (this.context && this.context.setSceneError) {
      this.context.setSceneError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      // Render nothing — the poster will remain visible in Home.jsx
      return null;
    }
    return this.props.children;
  }
}
