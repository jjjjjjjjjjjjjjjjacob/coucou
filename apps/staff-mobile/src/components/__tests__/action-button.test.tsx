import { fireEvent, render } from "@testing-library/react-native";
import { ActionButton } from "../action-button";

describe("ActionButton", () => {
  it("exposes an accessible action and handles a press", async () => {
    const onPress = jest.fn();
    const view = await render(<ActionButton label="Check ticket" onPress={onPress} />);

    fireEvent.press(view.getByRole("button", { name: "Check ticket" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("blocks interaction while loading", async () => {
    const onPress = jest.fn();
    const view = await render(<ActionButton isLoading label="Export guests" onPress={onPress} />);

    fireEvent.press(view.getByRole("button", { name: "Export guests" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
