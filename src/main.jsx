import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import MacOSWebsiteLoader from './components/MacOSWebsiteLoader.jsx'
createRoot(document.getElementById('root')).render(
  <MacOSWebsiteLoader>

    <App />
  </MacOSWebsiteLoader>
)
