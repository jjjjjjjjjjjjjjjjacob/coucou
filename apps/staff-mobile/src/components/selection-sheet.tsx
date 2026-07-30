import { Check, ChevronDown, X } from "lucide-react-native";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, minimumTargetStyle, radii, spacing, typography } from "@/theme";

export interface SelectionOption {
  key: string;
  label: string;
  description?: string;
}

interface SelectionSheetProps {
  accessibilityLabel: string;
  label: string;
  options: SelectionOption[];
  selectedKey: string | undefined;
  visible: boolean;
  renderTrigger?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (option: SelectionOption) => void;
}

export function SelectionSheet({
  accessibilityLabel,
  label,
  options,
  selectedKey,
  visible,
  renderTrigger = true,
  onOpen,
  onClose,
  onSelect,
}: SelectionSheetProps): React.JSX.Element {
  return (
    <>
      {renderTrigger ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onOpen}
          style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        >
          <Text numberOfLines={1} style={styles.triggerLabel}>
            {label}
          </Text>
          <ChevronDown color={colors.steel} size={18} strokeWidth={1.75} />
        </Pressable>
      ) : null}
      <Modal
        animationType="slide"
        onRequestClose={onClose}
        presentationStyle="pageSheet"
        visible={visible}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{accessibilityLabel}</Text>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <X color={colors.paper} size={22} />
            </Pressable>
          </View>
          <FlatList
            data={options}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyExtractor={(option) => option.key}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.key === selectedKey }}
                onPress={() => onSelect(item)}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{item.label}</Text>
                  {item.description ? (
                    <Text style={styles.optionDescription}>{item.description}</Text>
                  ) : null}
                </View>
                {item.key === selectedKey ? <Check color={colors.admit} size={22} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    ...minimumTargetStyle,
    maxWidth: 230,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.small,
    borderColor: colors.rule,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.medium,
  },
  triggerLabel: {
    flexShrink: 1,
    color: colors.paper,
    fontFamily: typography.medium,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.65,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.night,
    paddingHorizontal: spacing.large,
    paddingTop: spacing.large,
  },
  sheetHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 22,
  },
  closeButton: {
    ...minimumTargetStyle,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
  },
  option: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.large,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    color: colors.paper,
    fontFamily: typography.medium,
    fontSize: 16,
  },
  optionDescription: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 13,
  },
});
