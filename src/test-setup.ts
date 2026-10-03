import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
window.scrollTo=()=>{};
globalThis.ResizeObserver=class {observe(){}unobserve(){}disconnect(){}};
