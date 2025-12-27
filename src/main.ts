import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Provide a browser-friendly global for libraries expecting Node's global object.
(window as any).global = window;

bootstrapApplication(AppComponent, appConfig);
