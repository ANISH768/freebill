export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
}

type ConfirmListener = (
  options: (ConfirmDialogOptions & { resolve: (result: boolean) => void }) | null
) => void;

let activeListener: ConfirmListener | null = null;
let pendingRequest: (ConfirmDialogOptions & { resolve: (result: boolean) => void }) | null = null;

export function subscribeConfirmModal(listener: ConfirmListener): () => void {
  activeListener = listener;
  if (pendingRequest) {
    listener(pendingRequest);
  }
  return () => {
    if (activeListener === listener) {
      activeListener = null;
    }
  };
}

export function requestConfirm(options: ConfirmDialogOptions | string): Promise<boolean> {
  const normalized: ConfirmDialogOptions =
    typeof options === 'string'
      ? {
          title: 'Confirm Action',
          message: options,
          confirmText: 'Confirm',
          cancelText: 'Cancel',
          variant: 'danger',
        }
      : {
          confirmText: 'Confirm',
          cancelText: 'Cancel',
          variant: 'danger',
          ...options,
        };

  return new Promise<boolean>((resolve) => {
    const req = {
      ...normalized,
      resolve: (val: boolean) => {
        pendingRequest = null;
        if (activeListener) {
          activeListener(null);
        }
        resolve(val);
      },
    };
    pendingRequest = req;
    if (activeListener) {
      activeListener(req);
    } else {
      // Fallback if modal host is not mounted for any reason
      resolve(true);
    }
  });
}
