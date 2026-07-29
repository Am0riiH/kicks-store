import React from 'react';
import { SceneContext } from '../context/SceneContext.jsx';

/**
 * SceneErrorBoundary catches errors that happen while lazy-loading
 * the Three.js chunk (e.g. network failure) or during WebGL/GLTF parsing.
 * If an error occurs, it sets `sceneError` in SceneContext so the rest of the
 * app (like Home.jsx) knows to gracefully degrade and keep the 2D poster visible permanently.
 */
export default class SceneErrorBoundary extends React.Component {
  static contextType = SceneContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
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
