/**
 * Keyboard Navigation Utilities for Subnet Management
 * Provides comprehensive keyboard support for all interactive elements
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface KeyboardNavigationOptions {
  enableArrowKeys?: boolean;
  enableTabNavigation?: boolean;
  enableShortcuts?: boolean;
  enableEscapeHandling?: boolean;
  enableEnterHandling?: boolean;
  enableSpaceHandling?: boolean;
  trapFocus?: boolean;
  autoFocus?: boolean;
}

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  action: () => void;
  description: string;
  category?: string;
}

export interface FocusableElement {
  id: string;
  element: HTMLElement;
  type: 'button' | 'input' | 'select' | 'checkbox' | 'link' | 'custom';
  group?: string;
  priority?: number;
}

/**
 * Hook for managing keyboard navigation within a component
 */
export function useKeyboardNavigation(
  containerRef: React.RefObject<HTMLElement | null>,
  options: KeyboardNavigationOptions = {}
) {
  const {
    enableArrowKeys = true,
    enableTabNavigation = true,
    enableShortcuts = true,
    enableEscapeHandling = true,
    enableEnterHandling = true,
    enableSpaceHandling = true,
    trapFocus = false,
    autoFocus = false
  } = options;

  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);
  const focusableElements = useRef<FocusableElement[]>([]);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  // Find all focusable elements within the container
  const updateFocusableElements = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const elements: FocusableElement[] = [];

    // Query for all potentially focusable elements
    const selectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[role="button"]:not([disabled])',
      '[role="checkbox"]:not([disabled])',
      '[role="radio"]:not([disabled])',
      '[role="menuitem"]:not([disabled])',
      '[role="tab"]:not([disabled])',
      '[role="option"]:not([disabled])'
    ];

    const foundElements = container.querySelectorAll(selectors.join(', '));

    foundElements.forEach((element, index) => {
      if (element instanceof HTMLElement && isElementVisible(element)) {
        const focusableElement: FocusableElement = {
          id: element.id || `focusable-${index}`,
          element,
          type: getFocusableElementType(element),
          group: element.getAttribute('data-focus-group') || undefined,
          priority: parseInt(element.getAttribute('data-focus-priority') || '0', 10)
        };
        elements.push(focusableElement);
      }
    });

    // Sort by priority and DOM order
    elements.sort((a, b) => {
      const aPriority = a.priority || 0;
      const bPriority = b.priority || 0;
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      // Use DOM order for same priority
      return Array.from(container.querySelectorAll('*')).indexOf(a.element) -
             Array.from(container.querySelectorAll('*')).indexOf(b.element);
    });

    focusableElements.current = elements;
  }, [containerRef]);

  // Check if element is visible and focusable
  const isElementVisible = (element: HTMLElement): boolean => {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0 &&
      !element.hasAttribute('aria-hidden')
    );
  };

  // Determine the type of focusable element
  const getFocusableElementType = (element: HTMLElement): FocusableElement['type'] => {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');

    if (tagName === 'button' || role === 'button') return 'button';
    if (tagName === 'input') {
      const type = (element as HTMLInputElement).type;
      return type === 'checkbox' || type === 'radio' ? 'checkbox' : 'input';
    }
    if (tagName === 'select') return 'select';
    if (tagName === 'a') return 'link';
    if (role === 'checkbox') return 'checkbox';
    
    return 'custom';
  };

  // Focus an element by index
  const focusElementByIndex = useCallback((index: number) => {
    const elements = focusableElements.current;
    if (index >= 0 && index < elements.length) {
      const element = elements[index].element;
      element.focus();
      setFocusedIndex(index);
      lastFocusedElement.current = element;
    }
  }, []);

  // Move focus in a direction
  const moveFocus = useCallback((direction: 'next' | 'previous' | 'first' | 'last') => {
    updateFocusableElements();
    const elements = focusableElements.current;
    
    if (elements.length === 0) return;

    let newIndex: number;

    switch (direction) {
      case 'first':
        newIndex = 0;
        break;
      case 'last':
        newIndex = elements.length - 1;
        break;
      case 'next':
        newIndex = focusedIndex < elements.length - 1 ? focusedIndex + 1 : 0;
        break;
      case 'previous':
        newIndex = focusedIndex > 0 ? focusedIndex - 1 : elements.length - 1;
        break;
      default:
        return;
    }

    focusElementByIndex(newIndex);
  }, [focusedIndex, focusElementByIndex, updateFocusableElements]);

  // Handle keyboard events
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!containerRef.current?.contains(event.target as Node)) return;

    const { key, ctrlKey, altKey, shiftKey, metaKey } = event;

    // Handle shortcuts first
    if (enableShortcuts) {
      const matchingShortcut = shortcuts.find(shortcut => 
        shortcut.key.toLowerCase() === key.toLowerCase() &&
        !!shortcut.ctrlKey === ctrlKey &&
        !!shortcut.altKey === altKey &&
        !!shortcut.shiftKey === shiftKey &&
        !!shortcut.metaKey === metaKey
      );

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.action();
        return;
      }
    }

    // Handle arrow key navigation
    if (enableArrowKeys) {
      switch (key) {
        case 'ArrowDown':
        case 'ArrowRight':
          // Only prevent default if we're not in an input field
          const target = event.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            event.preventDefault();
            moveFocus('next');
          }
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          // Only prevent default if we're not in an input field
          const targetUp = event.target as HTMLElement;
          if (targetUp.tagName !== 'INPUT' && targetUp.tagName !== 'TEXTAREA') {
            event.preventDefault();
            moveFocus('previous');
          }
          break;
        case 'Home':
          if (ctrlKey) {
            event.preventDefault();
            moveFocus('first');
          }
          break;
        case 'End':
          if (ctrlKey) {
            event.preventDefault();
            moveFocus('last');
          }
          break;
      }
    }

    // Handle Tab navigation with focus trapping
    if (enableTabNavigation && key === 'Tab' && trapFocus) {
      updateFocusableElements();
      const elements = focusableElements.current;
      
      if (elements.length === 0) return;

      const currentIndex = elements.findIndex(el => el.element === document.activeElement);
      
      if (shiftKey) {
        // Shift+Tab - move to previous element
        if (currentIndex <= 0) {
          event.preventDefault();
          focusElementByIndex(elements.length - 1);
        }
      } else {
        // Tab - move to next element
        if (currentIndex >= elements.length - 1) {
          event.preventDefault();
          focusElementByIndex(0);
        }
      }
    }

    // Handle Escape key
    if (enableEscapeHandling && key === 'Escape') {
      const target = event.target as HTMLElement;
      
      // Close dropdowns, modals, etc.
      const closeButton = containerRef.current?.querySelector('[data-close-on-escape]') as HTMLElement;
      if (closeButton) {
        closeButton.click();
      }
      
      // Blur current element if it's an input
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        target.blur();
      }
    }

    // Handle Enter key
    if (enableEnterHandling && key === 'Enter') {
      const target = event.target as HTMLElement;
      
      // Activate buttons and links
      if (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button') {
        target.click();
      }
    }

    // Handle Space key
    if (enableSpaceHandling && key === ' ') {
      const target = event.target as HTMLElement;
      
      // Toggle checkboxes
      if (target.getAttribute('role') === 'checkbox' || 
          (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox')) {
        event.preventDefault();
        target.click();
      }
      
      // Activate buttons (but not if it's an input field)
      if (target.tagName === 'BUTTON' || 
          (target.getAttribute('role') === 'button' && target.tagName !== 'INPUT')) {
        event.preventDefault();
        target.click();
      }
    }
  }, [
    containerRef,
    enableShortcuts,
    enableArrowKeys,
    enableTabNavigation,
    enableEscapeHandling,
    enableEnterHandling,
    enableSpaceHandling,
    trapFocus,
    shortcuts,
    moveFocus,
    updateFocusableElements,
    focusElementByIndex
  ]);

  // Register keyboard shortcuts
  const registerShortcut = useCallback((shortcut: KeyboardShortcut) => {
    setShortcuts(prev => [...prev.filter(s => s.key !== shortcut.key), shortcut]);
  }, []);

  // Unregister keyboard shortcuts
  const unregisterShortcut = useCallback((key: string) => {
    setShortcuts(prev => prev.filter(s => s.key !== key));
  }, []);

  // Get all registered shortcuts (for help display)
  const getShortcuts = useCallback(() => shortcuts, [shortcuts]);

  // Focus first element
  const focusFirst = useCallback(() => {
    moveFocus('first');
  }, [moveFocus]);

  // Focus last element
  const focusLast = useCallback(() => {
    moveFocus('last');
  }, [moveFocus]);

  // Restore focus to last focused element
  const restoreFocus = useCallback(() => {
    if (lastFocusedElement.current && isElementVisible(lastFocusedElement.current)) {
      lastFocusedElement.current.focus();
    } else {
      focusFirst();
    }
  }, [focusFirst]);

  // Set up event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Update focusable elements when container changes
    updateFocusableElements();

    // Auto-focus first element if enabled
    if (autoFocus) {
      setTimeout(() => focusFirst(), 0);
    }

    // Add keyboard event listener
    document.addEventListener('keydown', handleKeyDown);

    // Add focus event listeners to track focused element
    const handleFocus = (event: FocusEvent) => {
      if (container.contains(event.target as Node)) {
        const elements = focusableElements.current;
        const index = elements.findIndex(el => el.element === event.target);
        if (index !== -1) {
          setFocusedIndex(index);
          lastFocusedElement.current = event.target as HTMLElement;
        }
      }
    };

    container.addEventListener('focus', handleFocus, true);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('focus', handleFocus, true);
    };
  }, [containerRef, handleKeyDown, updateFocusableElements, autoFocus, focusFirst]);

  // Update focusable elements when container content changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      updateFocusableElements();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'tabindex', 'aria-hidden']
    });

    return () => observer.disconnect();
  }, [containerRef, updateFocusableElements]);

  return {
    focusedIndex,
    focusableElements: focusableElements.current,
    registerShortcut,
    unregisterShortcut,
    getShortcuts,
    moveFocus,
    focusFirst,
    focusLast,
    restoreFocus,
    updateFocusableElements
  };
}

/**
 * Hook for managing keyboard shortcuts in subnet management
 */
export function useSubnetKeyboardShortcuts() {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 's',
      ctrlKey: true,
      action: () => {
        const splitButton = document.querySelector('[data-action="split-subnet"]') as HTMLElement;
        splitButton?.click();
      },
      description: 'Split subnet',
      category: 'Subnet Operations'
    },
    {
      key: 'j',
      ctrlKey: true,
      action: () => {
        const joinButton = document.querySelector('[data-action="join-subnets"]') as HTMLElement;
        joinButton?.click();
      },
      description: 'Join selected subnets',
      category: 'Subnet Operations'
    },
    {
      key: 'a',
      ctrlKey: true,
      action: () => {
        const selectAllCheckbox = document.querySelector('[data-action="select-all"]') as HTMLInputElement;
        selectAllCheckbox?.click();
      },
      description: 'Select all subnets',
      category: 'Selection'
    },
    {
      key: 'Escape',
      action: () => {
        // Clear selection
        const clearButton = document.querySelector('[data-action="clear-selection"]') as HTMLElement;
        clearButton?.click();
      },
      description: 'Clear selection',
      category: 'Selection'
    },
    {
      key: 'c',
      ctrlKey: true,
      action: () => {
        const copyButton = document.querySelector('[data-action="copy-selected"]') as HTMLElement;
        copyButton?.click();
      },
      description: 'Copy selected subnets',
      category: 'Export'
    },
    {
      key: 'r',
      ctrlKey: true,
      action: () => {
        const resetButton = document.querySelector('[data-action="reset-subnets"]') as HTMLElement;
        resetButton?.click();
      },
      description: 'Reset subnet management',
      category: 'Management'
    },
    {
      key: 'l',
      ctrlKey: true,
      action: () => {
        const listViewButton = document.querySelector('[data-action="view-list"]') as HTMLElement;
        listViewButton?.click();
      },
      description: 'Switch to list view',
      category: 'View'
    },
    {
      key: 't',
      ctrlKey: true,
      action: () => {
        const treeViewButton = document.querySelector('[data-action="view-tree"]') as HTMLElement;
        treeViewButton?.click();
      },
      description: 'Switch to tree view',
      category: 'View'
    },
    {
      key: 'f',
      ctrlKey: true,
      action: () => {
        const searchInput = document.querySelector('[data-action="search-subnets"]') as HTMLInputElement;
        searchInput?.focus();
      },
      description: 'Focus search field',
      category: 'Navigation'
    },
    {
      key: 'h',
      ctrlKey: true,
      action: () => {
        // Show help modal
        const helpButton = document.querySelector('[data-action="show-help"]') as HTMLElement;
        helpButton?.click();
      },
      description: 'Show keyboard shortcuts help',
      category: 'Help'
    }
  ];

  return shortcuts;
}

/**
 * Component for displaying keyboard shortcuts help
 */
export interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Utility function to format keyboard shortcut display
 */
export function formatKeyboardShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.shiftKey) parts.push('Shift');
  if (shortcut.metaKey) parts.push('Cmd');
  
  parts.push(shortcut.key.toUpperCase());
  
  return parts.join(' + ');
}

/**
 * Hook for managing focus within a modal or dialog
 */
export function useModalFocus(
  isOpen: boolean,
  modalRef: React.RefObject<HTMLElement>
) {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      // Store the previously focused element
      previousFocus.current = document.activeElement as HTMLElement;
      
      // Focus the first focusable element in the modal
      const firstFocusable = modalRef.current.querySelector(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }

    return () => {
      // Restore focus when modal closes
      if (!isOpen && previousFocus.current) {
        previousFocus.current.focus();
      }
    };
  }, [isOpen, modalRef]);
}