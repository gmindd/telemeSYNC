import { EditorScreen } from './screens/EditorScreen.tsx';
import { ExportScreen } from './screens/ExportScreen.tsx';
import { StartScreen } from './screens/StartScreen.tsx';
import { useProject } from './state.ts';

export function App() {
  const screen = useProject((s) => s.screen);
  const ready = useProject((s) => !!(s.clip && s.info && s.ride));
  if (screen === 'start' || !ready) return <StartScreen />;
  return screen === 'export' ? <ExportScreen /> : <EditorScreen />;
}
