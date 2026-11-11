import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ALVO_MINIMO, cores } from '@sii/config/tokens';

export default function Inicio() {
  return (
    <View style={estilos.tela}>
      <Stack.Screen options={{ title: 'SII · Campo' }} />
      <Text accessibilityRole="header" style={estilos.titulo}>
        SII · Campo
      </Text>
      <Text style={estilos.texto}>
        App de campo do Sistema Integrado Intersecretarial da Prefeitura de Itapuã do Oeste.
      </Text>
      <View accessibilityRole="text" style={estilos.aviso}>
        <Text style={estilos.avisoTexto}>Em construção. A carteira de visitas entra no P17.</Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, padding: 16, gap: 12, backgroundColor: cores.fundo },
  titulo: { fontSize: 24, fontWeight: '700', color: cores.textoForte },
  texto: { fontSize: 16, lineHeight: 24, color: cores.texto },
  aviso: {
    minHeight: ALVO_MINIMO,
    justifyContent: 'center',
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: cores.primaria,
    backgroundColor: cores.primariaClara,
  },
  avisoTexto: { fontSize: 16, color: cores.textoForte },
});
