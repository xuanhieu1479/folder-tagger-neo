import { validator } from 'hono/validator';
import * as v from 'valibot';
import { HttpError } from './errors';

type Schema = v.GenericSchema<any, any>;

const parse = <S extends Schema>(schema: S, value: unknown): v.InferOutput<S> => {
  const result = v.safeParse(schema, value);
  if (!result.success) throw new HttpError(400, `Invalid request: ${result.issues[0].message}`);
  return result.output;
};

export const jsonBody = <S extends Schema>(schema: S) =>
  validator('json', (value): v.InferOutput<S> => parse(schema, value));

export const queryParams = <S extends Schema>(schema: S) =>
  validator('query', (value): v.InferOutput<S> => parse(schema, value));
