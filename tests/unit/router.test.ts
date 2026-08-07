import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { match, navigate, start, mount, type RouteMatch } from '@/app/router';

describe('router match', () => {
  it('matches teacher home', () => {
    expect(match('/')).toEqual({
      name: 'teacher-home',
      params: {},
      requiresAuth: true,
      path: '/'
    });
  });

  it('matches teacher lesson editor', () => {
    expect(match('/lessons/lesson_aotfw_008')).toEqual({
      name: 'teacher-lesson',
      params: { lessonId: 'lesson_aotfw_008' },
      requiresAuth: true,
      path: '/lessons/lesson_aotfw_008'
    });
  });

  it('matches public student lesson view', () => {
    expect(match('/s/lessons/lesson_aotfw_008')).toEqual({
      name: 'student-lesson',
      params: { lessonId: 'lesson_aotfw_008' },
      requiresAuth: false,
      path: '/s/lessons/lesson_aotfw_008'
    });
  });

  it('matches sign-in gate', () => {
    expect(match('/sign-in')).toEqual({
      name: 'sign-in',
      params: {},
      requiresAuth: false,
      path: '/sign-in'
    });
  });

  it('normalizes trailing slashes and query strings', () => {
    expect(match('/sign-in/?next=%2F')).toEqual({
      name: 'sign-in',
      params: {},
      requiresAuth: false,
      path: '/sign-in'
    });
  });

  it('returns null for unknown paths', () => {
    expect(match('/unknown')).toBeNull();
    expect(match('/lessons')).toBeNull();
    expect(match('/s/lessons')).toBeNull();
  });

  it('marks only teacher routes as auth-required', () => {
    const cases: Array<[string, boolean]> = [
      ['/', true],
      ['/lessons/lesson_aotfw_008', true],
      ['/s/lessons/lesson_aotfw_008', false],
      ['/sign-in', false]
    ];

    for (const [path, requiresAuth] of cases) {
      expect(match(path)?.requiresAuth).toBe(requiresAuth);
    }
  });
});

describe('router navigation', () => {
  let pushState: MockInstance<History['pushState']>;
  let replaceState: MockInstance<History['replaceState']>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    pushState = vi.spyOn(history, 'pushState');
    replaceState = vi.spyOn(history, 'replaceState');
  });

  afterEach(() => {
    pushState.mockRestore();
    replaceState.mockRestore();
  });

  it('navigate pushes history and notifies listeners', () => {
    const onRoute = vi.fn<(match: RouteMatch) => void>();
    const stop = start(onRoute);
    onRoute.mockClear();

    navigate('/lessons/lesson_aotfw_008');

    expect(pushState).toHaveBeenCalledWith(null, '', '/lessons/lesson_aotfw_008');
    expect(onRoute).toHaveBeenCalledWith({
      name: 'teacher-lesson',
      params: { lessonId: 'lesson_aotfw_008' },
      requiresAuth: true,
      path: '/lessons/lesson_aotfw_008'
    });

    stop();
  });

  it('navigate can replace history entries', () => {
    navigate('/sign-in', { replace: true });

    expect(replaceState).toHaveBeenCalledWith(null, '', '/sign-in');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('start handles browser back and forward', () => {
    const onRoute = vi.fn<(match: RouteMatch) => void>();
    const stop = start(onRoute);
    onRoute.mockClear();

    window.history.pushState(null, '', '/sign-in');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(onRoute).toHaveBeenCalledWith({
      name: 'sign-in',
      params: {},
      requiresAuth: false,
      path: '/sign-in'
    });

    stop();
  });

  it('mount is an alias for start', () => {
    expect(mount).toBe(start);
  });
});
