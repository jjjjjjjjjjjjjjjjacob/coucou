"use client";
import * as React from "react";
import {
  Dialog as BaseDialog,
  DialogTrigger as BaseTrigger,
  DialogContent as BaseContent,
  DialogHeader as BaseHeader,
  DialogFooter as BaseFooter,
  DialogTitle as BaseTitle,
  DialogDescription as BaseDescription,
  DialogClose as BaseClose,
} from "./dialog";
import { Button } from "./button";

function AlertDialog(props: React.ComponentProps<typeof BaseDialog>) {
  return <BaseDialog data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(
  props: React.ComponentProps<typeof BaseTrigger>,
) {
  return <BaseTrigger data-slot="alert-dialog-trigger" {...(props as any)} />;
}

function AlertDialogContent(
  props: React.ComponentProps<typeof BaseContent>,
) {
  return <BaseContent data-slot="alert-dialog-content" {...props} />;
}

function AlertDialogHeader(
  props: React.ComponentProps<typeof BaseHeader>,
) {
  return <BaseHeader data-slot="alert-dialog-header" {...props} />;
}

function AlertDialogFooter(
  props: React.ComponentProps<typeof BaseFooter>,
) {
  return <BaseFooter data-slot="alert-dialog-footer" {...props} />;
}

function AlertDialogTitle(
  props: React.ComponentProps<typeof BaseTitle>,
) {
  return <BaseTitle data-slot="alert-dialog-title" {...props} />;
}

function AlertDialogDescription(
  props: React.ComponentProps<typeof BaseDescription>,
) {
  return <BaseDescription data-slot="alert-dialog-description" {...props} />;
}

function AlertDialogAction(
  { children, onClick, hapticType = "success", ...rest }: React.ComponentProps<typeof Button>,
) {
  return (
    <BaseClose asChild>
      <Button
        data-slot="alert-dialog-action"
        onClick={onClick}
        hapticType={hapticType}
        {...rest}
      >
        {children}
      </Button>
    </BaseClose>
  );
}

function AlertDialogCancel(
  { children, onClick, hapticType = "light", ...rest }: React.ComponentProps<typeof Button>,
) {
  return (
    <BaseClose asChild>
      <Button
        data-slot="alert-dialog-cancel"
        variant="outline"
        onClick={onClick}
        hapticType={hapticType}
        {...rest}
      >
        {children}
      </Button>
    </BaseClose>
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};

