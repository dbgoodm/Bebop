/** Demo mode is deliberately opt-in so production and Tauri builds never show mock media. */
export const isDemoMode = import.meta.env.VITE_BEBOP_DEMO === 'true';
