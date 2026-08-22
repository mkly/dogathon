export async function composeAndRefresh(
  compose: () => Promise<Response>,
  refresh: () => void,
) {
  const response = await compose();

  if (response.ok) {
    refresh();
  }

  return response;
}
