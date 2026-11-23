import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { FeedbackProvider } from './lib/feedback';
import { ThemeProvider } from './lib/theme';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <FeedbackProvider>
          <AuthProvider><App /></AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
