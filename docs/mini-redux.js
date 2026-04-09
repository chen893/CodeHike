/**
 * Redux 核心源码实现（简化但完整版）
 * 包含：createStore, combineReducers, bindActionCreators, applyMiddleware, compose
 */

// ====================== compose ======================
/**
 * 从右到左组合多个函数
 * @param {...Function} funcs 要组合的函数
 * @returns {Function} 组合后的函数
 */
function compose(...funcs) {
  if (funcs.length === 0) {
    return (arg) => arg;
  }
  if (funcs.length === 1) {
    return funcs[0];
  }
  return funcs.reduce(
    (a, b) =>
      (...args) =>
        a(b(...args)),
  );
}

// ====================== createStore ======================
/**
 * 创建一个 Redux store，持有应用的所有状态
 * @param {Function} reducer 状态更新函数 (state, action) => newState
 * @param {any} preloadedState 初始状态
 * @param {Function} enhancer 增强器（如 applyMiddleware 的结果）
 * @returns {Object} store 对象 { getState, dispatch, subscribe, replaceReducer }
 */
function createStore(reducer, preloadedState, enhancer) {
  // 处理参数重载：preloadedState 可省略，enhancer 可能为第二个参数
  if (typeof preloadedState === "function" && typeof enhancer === "undefined") {
    enhancer = preloadedState;
    preloadedState = undefined;
  }

  if (enhancer !== undefined && typeof enhancer === "function") {
    // 如果有 enhancer，则用 enhancer 包装 createStore 并返回
    return enhancer(createStore)(reducer, preloadedState);
  }

  let currentReducer = reducer;
  let currentState = preloadedState;
  let currentListeners = new Map(); // 使用 Map 存储监听器，便于删除
  let nextListeners = currentListeners;
  let isDispatching = false;

  // 确保在修改监听器列表时不会影响正在迭代的列表
  function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
      nextListeners = new Map(currentListeners);
    }
  }

  /**
   * 读取当前状态树
   * @returns {any}
   */
  function getState() {
    if (isDispatching) {
      throw new Error(
        "You may not call store.getState() while the reducer is executing.",
      );
    }
    return currentState;
  }

  /**
   * 添加一个监听器，当 dispatch action 时会被调用
   * @param {Function} listener 监听函数
   * @returns {Function} 用于移除该监听器的函数
   */
  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new Error("Expected listener to be a function.");
    }
    if (isDispatching) {
      throw new Error(
        "You may not call store.subscribe() while the reducer is executing.",
      );
    }

    let isSubscribed = true;
    ensureCanMutateNextListeners();
    const listenerId = Symbol();
    nextListeners.set(listenerId, listener);

    return function unsubscribe() {
      if (!isSubscribed) return;
      if (isDispatching) {
        throw new Error(
          "You may not unsubscribe while the reducer is executing.",
        );
      }
      isSubscribed = false;
      ensureCanMutateNextListeners();
      nextListeners.delete(listenerId);
      currentListeners = null; // 允许 GC
    };
  }

  /**
   * 分发一个 action，触发状态更新
   * @param {Object} action 普通 action 对象，必须包含 type 字段
   * @returns {Object} 分发出去的 action
   */
  function dispatch(action) {
    if (!isPlainObject(action)) {
      throw new Error(
        "Actions must be plain objects. Use custom middleware for async actions.",
      );
    }
    if (typeof action.type === "undefined") {
      throw new Error('Actions may not have an undefined "type" property.');
    }
    if (isDispatching) {
      throw new Error("Reducers may not dispatch actions.");
    }

    try {
      isDispatching = true;
      currentState = currentReducer(currentState, action);
    } finally {
      isDispatching = false;
    }

    // 通知所有监听器
    const listeners = (currentListeners = nextListeners);
    listeners.forEach((listener) => {
      listener();
    });

    return action;
  }

  /**
   * 动态替换 reducer（用于代码分割或热重载）
   * @param {Function} nextReducer 新的 reducer
   */
  function replaceReducer(nextReducer) {
    if (typeof nextReducer !== "function") {
      throw new Error("Expected the nextReducer to be a function.");
    }
    currentReducer = nextReducer;
    // 触发一个初始化 action 来用新 reducer 刷新状态
    dispatch({ type: "@@redux/INIT" });
  }

  // 初始化：触发一个内部 action 来填充初始状态
  dispatch({ type: "@@redux/INIT" });

  return {
    dispatch,
    subscribe,
    getState,
    replaceReducer,
  };
}

// ====================== combineReducers ======================
/**
 * 将多个 reducer 函数合并成一个大的 reducer
 * @param {Object} reducers 一个对象，key 为状态名，value 为对应的 reducer 函数
 * @returns {Function} 合并后的 reducer
 */
function combineReducers(reducers) {
  const reducerKeys = Object.keys(reducers);
  const finalReducers = {};
  for (let i = 0; i < reducerKeys.length; i++) {
    const key = reducerKeys[i];
    if (typeof reducers[key] === "function") {
      finalReducers[key] = reducers[key];
    }
  }
  const finalReducerKeys = Object.keys(finalReducers);

  // 返回合并后的 reducer
  return function combination(state = {}, action) {
    let hasChanged = false;
    const nextState = {};
    for (let i = 0; i < finalReducerKeys.length; i++) {
      const key = finalReducerKeys[i];
      const reducer = finalReducers[key];
      const previousStateForKey = state[key];
      const nextStateForKey = reducer(previousStateForKey, action);
      if (typeof nextStateForKey === "undefined") {
        throw new Error(`Reducer "${key}" returned undefined.`);
      }
      nextState[key] = nextStateForKey;
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey;
    }
    return hasChanged ? nextState : state;
  };
}

// ====================== bindActionCreators ======================
/**
 * 将 action creator 对象包装成可直接 dispatch 的形式
 * @param {Object|Function} actionCreators 一个 action creator 或包含多个 action creator 的对象
 * @param {Function} dispatch store.dispatch 方法
 * @returns {Object|Function} 包装后的对象/函数
 */
function bindActionCreators(actionCreators, dispatch) {
  if (typeof actionCreators === "function") {
    return function boundActionCreator(...args) {
      return dispatch(actionCreators(...args));
    };
  }

  if (typeof actionCreators !== "object" || actionCreators === null) {
    throw new Error("bindActionCreators expected an object or a function.");
  }

  const boundActionCreators = {};
  for (const key in actionCreators) {
    const actionCreator = actionCreators[key];
    if (typeof actionCreator === "function") {
      boundActionCreators[key] = (...args) => dispatch(actionCreator(...args));
    }
  }
  return boundActionCreators;
}

// ====================== applyMiddleware ======================
/**
 * 使用中间件增强 dispatch
 * @param {...Function} middlewares 要应用的中间件列表
 * @returns {Function} enhancer，用于 createStore
 */
function applyMiddleware(...middlewares) {
  return (createStore) => (reducer, preloadedState) => {
    const store = createStore(reducer, preloadedState);
    let dispatch = () => {
      throw new Error(
        "Dispatching while constructing your middleware is not allowed.",
      );
    };

    const middlewareAPI = {
      getState: store.getState,
      dispatch: (action, ...args) => dispatch(action, ...args),
    };

    const chain = middlewares.map((middleware) => middleware(middlewareAPI));
    dispatch = compose(...chain)(store.dispatch);

    return {
      ...store,
      dispatch,
    };
  };
}

// ====================== 工具函数 ======================
function isPlainObject(obj) {
  if (typeof obj !== "object" || obj === null) return false;
  let proto = obj;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(obj) === proto;
}

// ====================== 导出 ======================
// 如果运行在 CommonJS 或 ES 模块环境，导出所有 API
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createStore,
    combineReducers,
    bindActionCreators,
    applyMiddleware,
    compose,
  };
}

// ====================== 使用示例 ======================
// 以下是一个完整的计数器 + 用户信息示例，演示如何使用上述 API
/*
// 1. 定义 reducer
const counterReducer = (state = 0, action) => {
  switch (action.type) {
    case 'INCREMENT': return state + 1;
    case 'DECREMENT': return state - 1;
    default: return state;
  }
};

const userReducer = (state = { name: 'Guest' }, action) => {
  switch (action.type) {
    case 'SET_NAME': return { ...state, name: action.payload };
    default: return state;
  }
};

// 2. 合并 reducer
const rootReducer = combineReducers({
  count: counterReducer,
  user: userReducer,
});

// 3. 定义中间件（日志中间件）
const loggerMiddleware = (store) => (next) => (action) => {
  console.log('dispatching', action);
  console.log('prev state', store.getState());
  const result = next(action);
  console.log('next state', store.getState());
  return result;
};

// 4. 创建 store 并使用中间件
const store = createStore(rootReducer, applyMiddleware(loggerMiddleware));

// 5. 订阅状态变化
store.subscribe(() => {
  console.log('state updated:', store.getState());
});

// 6. 定义 action creators
const increment = () => ({ type: 'INCREMENT' });
const decrement = () => ({ type: 'DECREMENT' });
const setName = (name) => ({ type: 'SET_NAME', payload: name });

// 7. 绑定 action creators
const actions = bindActionCreators({ increment, decrement, setName }, store.dispatch);

// 8. 分发 action
actions.increment();   // count: 1
actions.increment();   // count: 2
actions.decrement();   // count: 1
actions.setName('Alice'); // user.name: 'Alice'

console.log(store.getState()); // { count: 1, user: { name: 'Alice' } }
*/
