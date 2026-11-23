// Array.prototype.at arrived in Safari 15.4. The Supabase client uses it, so
// iPhones that have not updated past iOS 15.3 need this small stand-in.
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true,
    writable: true,
    value: function at<T>(this: T[], index: number): T | undefined {
      const i = Math.trunc(index) || 0;
      return this[i < 0 ? this.length + i : i];
    },
  });
}
