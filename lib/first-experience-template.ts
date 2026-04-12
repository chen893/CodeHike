import type { SourceItem } from './schemas/source-item'
import type { TeachingBrief } from './schemas/teaching-brief'

/**
 * Preset template for first-time users to try the system.
 * Uses the mini-redux example from docs/mini-redux.js
 */
export const FIRST_EXPERIENCE_TEMPLATE = {
  sourceItems: [
    {
      id: 'example-1',
      kind: 'snippet' as const,
      label: 'mini-redux.js',
      language: 'javascript',
      content: `// Mini Redux - 一个简化版的状态管理库
function createStore(reducer) {
  let state;
  let listeners = [];

  function getState() {
    return state;
  }

  function dispatch(action) {
    state = reducer(state, action);
    listeners.forEach(listener => listener());
    return action;
  }

  function subscribe(listener) {
    listeners.push(listener);
    return function unsubscribe() {
      listeners = listeners.filter(l => l !== listener);
    };
  }

  dispatch({ type: '@@INIT' });

  return { getState, dispatch, subscribe };
}

function combineReducers(reducers) {
  return function combination(state = {}, action) {
    let hasChanged = false;
    const nextState = {};
    for (const key of Object.keys(reducers)) {
      nextState[key] = reducers[key](state[key], action);
      hasChanged = hasChanged || nextState[key] !== state[key];
    }
    return hasChanged ? nextState : state;
  };
}`,
    },
  ] satisfies SourceItem[],
  teachingBrief: {
    topic: 'Redux 核心原理：createStore 和 combineReducers',
    audience_level: 'beginner' as const,
    core_question: 'Redux 是如何管理应用状态的？createStore 和 combineReducers 的内部实现原理是什么？',
    ignore_scope: '中间件、异步 action、React 集成',
    output_language: '中文',
    desired_depth: 'medium' as const,
  } satisfies TeachingBrief,
}
