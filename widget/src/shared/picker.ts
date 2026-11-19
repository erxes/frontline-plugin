/**
 * Opens a date input's calendar on a click anywhere in it: desktop Chrome opens it only from the
 * small icon at its end. A website that frames the embed from another origin keeps that icon,
 * since the browser refuses to open the calendar there.
 */
export const openDatePicker = (event: { currentTarget: HTMLInputElement }) => {
  if (window.self === window.top && !event.currentTarget.readOnly) event.currentTarget.showPicker();
};
