import { useEffect, useRef } from 'react';

export function useTabHistory<T extends string>(
  activeTab: T,
  setActiveTab: (tab: T) => void,
  defaultTab: T
) {
  const isPopStateEvent = useRef(false);

  useEffect(() => {
    // Initial state
    if (!window.history.state || (!window.history.state.tab && !window.history.state.dummy)) {
      window.history.replaceState({ dummy: true }, "");
      window.history.pushState({ tab: activeTab }, "");
    } else if (window.history.state.dummy) {
      window.history.pushState({ tab: activeTab }, "");
    }
  }, []);

  useEffect(() => {
    if (isPopStateEvent.current) {
      // If the tab changed due to a back/forward button, just reset the flag
      isPopStateEvent.current = false;
      return;
    }

    // Push new state when tab changes normally
    if (window.history.state?.tab !== activeTab) {
      window.history.pushState({ tab: activeTab }, "");
    }
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      isPopStateEvent.current = true;
      
      if (e.state && e.state.dummy) {
        // We reached the dummy state (tried to go back from home). Trap them.
        window.history.pushState({ tab: defaultTab }, "");
        setActiveTab(defaultTab);
        isPopStateEvent.current = false;
      } else if (e.state && e.state.tab) {
        setActiveTab(e.state.tab);
      } else {
        setActiveTab(defaultTab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setActiveTab, defaultTab]);
}
