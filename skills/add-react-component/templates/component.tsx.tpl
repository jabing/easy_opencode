type {{subject}}Props = {
  title?: string;
};

export function {{subject}}({ title = '{{subject}}' }: {{subject}}Props) {
  return <section>{title}</section>;
}
