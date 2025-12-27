import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { ErrorToastService } from '../ui/toast/error-toast.service';

/**
 * Global HTTP error interceptor that surfaces API failures through the toast system.
 */
export const errorToastInterceptor: HttpInterceptorFn = (req, next) => {
  const errorToast = inject(ErrorToastService);

  return next(req).pipe(
    catchError((err) => {
      errorToast.toastError(err, 'Request failed');
      return throwError(() => err);
    })
  );
};
