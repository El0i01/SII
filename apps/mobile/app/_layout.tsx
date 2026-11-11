import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { cores } from '@sii/config/tokens';

export default function Layout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: cores.primaria },
          headerTintColor: cores.fundo,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: cores.fundo },
        }}
      />
    </>
  );
}
