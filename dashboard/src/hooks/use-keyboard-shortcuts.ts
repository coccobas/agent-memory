import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface Shortcut {
  key: string;
  label: string;
  description: string;
  action: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [gPressed, setGPressed] = useState(false);

  const navigationShortcuts: ShortcutGroup = {
    title: 'Navigation (g + key)',
    shortcuts: [
      {
        key: 'd',
        label: 'g d',
        description: 'Go to Dashboard',
        action: () => navigate('/'),
      },
      {
        key: 'g',
        label: 'g g',
        description: 'Go to Guidelines',
        action: () => navigate('/guidelines'),
      },
      {
        key: 'k',
        label: 'g k',
        description: 'Go to Knowledge',
        action: () => navigate('/knowledge'),
      },
      {
        key: 't',
        label: 'g t',
        description: 'Go to Tools',
        action: () => navigate('/tools'),
      },
      {
        key: 'x',
        label: 'g x',
        description: 'Go to Experiences',
        action: () => navigate('/experiences'),
      },
      {
        key: 's',
        label: 'g s',
        description: 'Go to Sessions',
        action: () => navigate('/sessions'),
      },
      {
        key: 'e',
        label: 'g e',
        description: 'Go to Episodes',
        action: () => navigate('/episodes'),
      },
      {
        key: 'r',
        label: 'g r',
        description: 'Go to Graph',
        action: () => navigate('/graph'),
      },
      {
        key: 'l',
        label: 'g l',
        description: 'Go to Librarian',
        action: () => navigate('/librarian'),
      },
      {
        key: 'a',
        label: 'g a',
        description: 'Go to Analytics',
        action: () => navigate('/analytics'),
      },
    ],
  };

  const globalShortcuts: ShortcutGroup = {
    title: 'Global',
    shortcuts: [
      {
        key: '?',
        label: '?',
        description: 'Show keyboard shortcuts',
        action: () => setIsHelpOpen(true),
      },
    ],
  };

  const allGroups = [navigationShortcuts, globalShortcuts];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Show help on ?
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsHelpOpen((prev) => !prev);
        return;
      }

      // Close help on Escape
      if (e.key === 'Escape') {
        setIsHelpOpen(false);
        setGPressed(false);
        return;
      }

      // Handle g prefix for navigation
      if (e.key === 'g' && !gPressed && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setGPressed(true);
        // Reset after 1 second if no follow-up key
        setTimeout(() => setGPressed(false), 1000);
        return;
      }

      // Handle navigation keys after g
      if (gPressed) {
        const shortcut = navigationShortcuts.shortcuts.find((s) => s.key === e.key);
        if (shortcut) {
          e.preventDefault();
          shortcut.action();
          setIsHelpOpen(false);
        }
        setGPressed(false);
      }
    },
    [gPressed, navigationShortcuts.shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    isHelpOpen,
    closeHelp: () => setIsHelpOpen(false),
    openHelp: () => setIsHelpOpen(true),
    shortcutGroups: allGroups,
    gPressed,
  };
}
