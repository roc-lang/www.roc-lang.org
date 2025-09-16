## project specific instructions

See README.md for build instructions.

## general roc instructions

After you've made changes use `roc check edited_file.roc` to confirm it is free of errors.
Once `roc check` succeeds, you can run code with `roc file.roc`.
To run all top level expects, use `roc test file.roc`.

The Roc stdlib supports these functions (require no import):
```
Str.Utf8Problem : [ InvalidStartByte, UnexpectedEndOfSequence, ExpectedContinuation, OverlongEncoding, CodepointTooLarge, EncodesSurrogateHalf ]
Str.is_empty : Str -> Bool
Str.concat : Str, Str -> Str
Str.with_capacity : U64 -> Str
Str.reserve : Str, U64 -> Str
Str.join_with : List Str, Str -> Str
Str.split_on : Str, Str -> List Str
Str.repeat : Str, U64 -> Str
Str.len : Str -> [LearnAboutStringsInRoc Str]
Str.to_utf8 : Str -> List U8
Str.from_utf8 : List U8 -> Result Str [ BadUtf8 { problem : Utf8Problem, index : U64 } ]
Str.from_utf8_lossy : List U8 -> Str
Str.from_utf16 : List U16 -> Result Str [ BadUtf16 { problem : Utf8Problem, index : U64 } ]
Str.from_utf16_lossy : List U16 -> Str
Str.from_utf32 : List U32 -> Result Str [ BadUtf32 { problem : Utf8Problem, index : U64 } ]
Str.from_utf32_lossy : List U32 -> Str
Str.starts_with : Str, Str -> Bool
Str.ends_with : Str, Str -> Bool
Str.trim : Str -> Str
Str.trim_start : Str -> Str
Str.trim_end : Str -> Str
Str.to_dec : Str -> Result Dec [InvalidNumStr]
Str.to_f64 : Str -> Result F64 [InvalidNumStr]
Str.to_f32 : Str -> Result F32 [InvalidNumStr]
Str.to_u128 : Str -> Result U128 [InvalidNumStr]
Str.to_i128 : Str -> Result I128 [InvalidNumStr]
Str.to_u64 : Str -> Result U64 [InvalidNumStr]
Str.to_i64 : Str -> Result I64 [InvalidNumStr]
Str.to_u32 : Str -> Result U32 [InvalidNumStr]
Str.to_i32 : Str -> Result I32 [InvalidNumStr]
Str.to_u16 : Str -> Result U16 [InvalidNumStr]
Str.to_i16 : Str -> Result I16 [InvalidNumStr]
Str.to_u8 : Str -> Result U8 [InvalidNumStr]
Str.to_i8 : Str -> Result I8 [InvalidNumStr]
Str.count_utf8_bytes : Str -> U64
Str.replace_each : Str, Str, Str -> Str
Str.replace_first : Str, Str, Str -> Str
Str.replace_last : Str, Str, Str -> Str
Str.split_first : Str, Str -> Result { before : Str, after : Str } [NotFound]
Str.split_last : Str, Str -> Result { before : Str, after : Str } [NotFound]
Str.walk_utf8_with_index : Str, state, (state, U8, U64 -> state) -> state
Str.walk_utf8 : Str, state, (state, U8 -> state) -> state
Str.release_excess_capacity : Str -> Str
Str.with_prefix : Str, Str -> Str
Str.contains : Str, Str -> Bool
Str.drop_prefix : Str, Str -> Str
Str.drop_suffix : Str, Str -> Str
Str.with_ascii_lowercased : Str -> Str
Str.with_ascii_uppercased : Str -> Str
Str.caseless_ascii_equals : Str, Str -> Bool
Num.e : Frac *
Num.pi : Frac *
Num.tau : Frac *
Num.to_str : Num * -> Str
Num.int_cast : Int a -> Int b
Num.compare : Num a, Num a -> [ LT, EQ, GT ]
Num.is_lt : Num a, Num a -> Bool
Num.is_gt : Num a, Num a -> Bool
Num.is_lte : Num a, Num a -> Bool
Num.is_gte : Num a, Num a -> Bool
Num.is_approx_eq : Frac a, Frac a, { rtol ? Frac a, atol ? Frac a } -> Bool
Num.is_zero : Num a -> Bool
Num.is_even : Int a -> Bool
Num.is_odd : Int a -> Bool
Num.is_positive : Num a -> Bool
Num.is_negative : Num a -> Bool
Num.to_frac : Num * -> Frac *
Num.is_nan : Frac * -> Bool
Num.is_infinite : Frac * -> Bool
Num.is_finite : Frac * -> Bool
Num.abs : Num a -> Num a
Num.abs_diff : Num a, Num a -> Num a
Num.neg : Num a -> Num a
Num.add : Num a, Num a -> Num a
Num.sub : Num a, Num a -> Num a
Num.mul : Num a, Num a -> Num a
Num.min : Num a, Num a -> Num a
Num.max : Num a, Num a -> Num a
Num.sin : Frac a -> Frac a
Num.cos : Frac a -> Frac a
Num.tan : Frac a -> Frac a
Num.asin : Frac a -> Frac a
Num.acos : Frac a -> Frac a
Num.atan : Frac a -> Frac a
Num.sqrt : Frac a -> Frac a
Num.sqrt_checked : Frac a -> Result (Frac a) [SqrtOfNegative]
Num.log : Frac a -> Frac a
Num.log_checked : Frac a -> Result (Frac a) [LogNeedsPositive]
Num.div : Frac a, Frac a -> Frac a
Num.div_checked : Frac a, Frac a -> Result (Frac a) [DivByZero]
Num.div_ceil : Int a, Int a -> Int a
Num.div_ceil_checked : Int a, Int a -> Result (Int a) [DivByZero]
Num.div_trunc : Int a, Int a -> Int a
Num.div_trunc_checked : Int a, Int a -> Result (Int a) [DivByZero]
Num.rem : Int a, Int a -> Int a
Num.rem_checked : Int a, Int a -> Result (Int a) [DivByZero]
Num.is_multiple_of : Int a, Int a -> Bool
Num.bitwise_and : Int a, Int a -> Int a
Num.bitwise_xor : Int a, Int a -> Int a
Num.bitwise_or : Int a, Int a -> Int a
Num.bitwise_not : Int a -> Int a
Num.shift_left_by : Int a, U8 -> Int a
Num.shift_right_by : Int a, U8 -> Int a
Num.shift_right_zf_by : Int a, U8 -> Int a
Num.round : Frac * -> Int *
Num.floor : Frac * -> Int *
Num.ceiling : Frac * -> Int *
Num.pow : Frac a, Frac a -> Frac a
Num.pow_int : Int a, Int a -> Int a
Num.count_leading_zero_bits : Int a -> U8
Num.count_trailing_zero_bits : Int a -> U8
Num.count_one_bits : Int a -> U8
Num.add_wrap : Int range, Int range -> Int range
Num.add_saturated : Num a, Num a -> Num a
Num.add_checked : Num a, Num a -> Result (Num a) [Overflow]
Num.sub_wrap : Int range, Int range -> Int range
Num.sub_saturated : Num a, Num a -> Num a
Num.sub_checked : Num a, Num a -> Result (Num a) [Overflow]
Num.mul_wrap : Int range, Int range -> Int range
Num.mul_saturated : Num a, Num a -> Num a
Num.mul_checked : Num a, Num a -> Result (Num a) [Overflow]
Num.min_i8 : I8
Num.max_i8 : I8
Num.min_u8 : U8
Num.max_u8 : U8
Num.min_i16 : I16
Num.max_i16 : I16
Num.min_u16 : U16
Num.max_u16 : U16
Num.min_i32 : I32
Num.max_i32 : I32
Num.min_u32 : U32
Num.max_u32 : U32
Num.min_i64 : I64
Num.max_i64 : I64
Num.min_u64 : U64
Num.max_u64 : U64
Num.min_i128 : I128
Num.max_i128 : I128
Num.min_u128 : U128
Num.max_u128 : U128
Num.min_f32 : F32
Num.max_f32 : F32
Num.min_f64 : F64
Num.max_f64 : F64
Num.to_i8 : Int * -> I8
Num.to_i16 : Int * -> I16
Num.to_i32 : Int * -> I32
Num.to_i64 : Int * -> I64
Num.to_i128 : Int * -> I128
Num.to_u8 : Int * -> U8
Num.to_u16 : Int * -> U16
Num.to_u32 : Int * -> U32
Num.to_u64 : Int * -> U64
Num.to_u128 : Int * -> U128
Num.to_f32 : Num * -> F32
Num.to_f64 : Num * -> F64
Num.to_i8_checked : Int * -> Result I8 [OutOfBounds]
Num.to_i16_checked : Int * -> Result I16 [OutOfBounds]
Num.to_i32_checked : Int * -> Result I32 [OutOfBounds]
Num.to_i64_checked : Int * -> Result I64 [OutOfBounds]
Num.to_i128_checked : Int * -> Result I128 [OutOfBounds]
Num.to_u8_checked : Int * -> Result U8 [OutOfBounds]
Num.to_u16_checked : Int * -> Result U16 [OutOfBounds]
Num.to_u32_checked : Int * -> Result U32 [OutOfBounds]
Num.to_u64_checked : Int * -> Result U64 [OutOfBounds]
Num.to_u128_checked : Int * -> Result U128 [OutOfBounds]
Num.to_f32_checked : Num * -> Result F32 [OutOfBounds]
Num.to_f64_checked : Num * -> Result F64 [OutOfBounds]
Num.without_decimal_point : Dec -> I128
Num.with_decimal_point : I128 -> Dec
Num.f32_to_parts : F32 -> { sign : Bool, exponent : U8, fraction : U32 }
Num.f64_to_parts : F64 -> { sign : Bool, exponent : U16, fraction : U64 }
Num.f32_from_parts : { sign : Bool, exponent : U8, fraction : U32 } -> F32
Num.f64_from_parts : { sign : Bool, exponent : U16, fraction : U64 } -> F64
Num.f32_to_bits : F32 -> U32
Num.f64_to_bits : F64 -> U64
Num.dec_to_bits : Dec -> U128
Num.f32_from_bits : U32 -> F32
Num.f64_from_bits : U64 -> F64
Num.dec_from_bits : U128 -> Dec
Num.from_bool : Bool -> Num *
Num.nan_f32 : F32
Num.nan_f64 : F64
Num.infinity_f32 : F32
Num.infinity_f64 : F64
Bool.Eq : implements
    is_eq : a, a -> Bool
        where a implements Eq
Bool.true : Bool
Bool.false : Bool
Bool.not : Bool -> Bool
Bool.is_not_eq : a, a -> Bool where a implements Eq
Result.Result : [ Ok ok, Err err ]
Result.is_ok : Result ok err -> Bool
Result.is_err : Result ok err -> Bool
Result.with_default : Result ok err, ok -> ok
Result.map_ok : Result a err, (a -> b) -> Result b err
Result.map_err : Result ok a, (a -> b) -> Result ok b
Result.on_err : Result a err, (err -> Result a other_err) -> Result a other_err
Result.on_err! : Result a err, (err => Result a other_err) => Result a other_err
Result.map_both : Result ok1 err1, (ok1 -> ok2), (err1 -> err2) -> Result ok2 err2
Result.map2 : Result a err, Result b err, (a, b -> c) -> Result c err
Result.try : Result a err, (a -> Result b err) -> Result b err
List.is_empty : List * -> Bool
List.get : List a, U64 -> Result a [OutOfBounds]
List.replace : List a, U64, a -> { list : List a, value : a }
List.set : List a, U64, a -> List a
List.update : List a, U64, (a -> a) -> List a
List.append : List a, a -> List a
List.append_if_ok : List a, Result a * -> List a
List.prepend : List a, a -> List a
List.prepend_if_ok : List a, Result a * -> List a
List.len : List * -> U64
List.with_capacity : U64 -> List *
List.reserve : List a, U64 -> List a
List.release_excess_capacity : List a -> List a
List.concat : List a, List a -> List a
List.last : List a -> Result a [ListWasEmpty]
List.single : a -> List a
List.repeat : a, U64 -> List a
List.reverse : List a -> List a
List.join : List (List a) -> List a
List.contains : List a, a -> Bool where a implements Eq
List.walk : List elem, state, (state, elem -> state) -> state
List.walk_with_index : List elem, state, (state, elem, U64 -> state) -> state
List.walk_with_index_until : List elem, state, (state, elem, U64 -> [ Continue state, Break state ]) -> state
List.walk_backwards : List elem, state, (state, elem -> state) -> state
List.walk_until : List elem, state, (state, elem -> [ Continue state, Break state ]) -> state
List.walk_backwards_until : List elem, state, (state, elem -> [ Continue state, Break state ]) -> state
List.walk_from : List elem, U64, state, (state, elem -> state) -> state
List.walk_from_until : List elem, U64, state, (state, elem -> [ Continue state, Break state ]) -> state
List.sum : List (Num a) -> Num a
List.product : List (Num a) -> Num a
List.any : List a, (a -> Bool) -> Bool
List.all : List a, (a -> Bool) -> Bool
List.keep_if : List a, (a -> Bool) -> List a
List.keep_if_try! : List a, (a => Result Bool err) => Result (List a) err
List.drop_if : List a, (a -> Bool) -> List a
List.count_if : List a, (a -> Bool) -> U64
List.keep_oks : List before, (before -> Result after *) -> List after
List.keep_errs : List before, (before -> Result * after) -> List after
List.map : List a, (a -> b) -> List b
List.map2 : List a, List b, (a, b -> c) -> List c
List.map3 : List a, List b, List c, (a, b, c -> d) -> List d
List.map4 : List a, List b, List c, List d, (a, b, c, d -> e) -> List e
List.map_with_index : List a, (a, U64 -> b) -> List b
List.sort_with : List a, (a, a -> [ LT, EQ, GT ]) -> List a
List.sort_asc : List (Num a) -> List (Num a)
List.sort_desc : List (Num a) -> List (Num a)
List.swap : List a, U64, U64 -> List a
List.first : List a -> Result a [ListWasEmpty]
List.take_first : List elem, U64 -> List elem
List.take_last : List elem, U64 -> List elem
List.drop_first : List elem, U64 -> List elem
List.drop_last : List elem, U64 -> List elem
List.drop_at : List elem, U64 -> List elem
List.min : List (Num a) -> Result (Num a) [ListWasEmpty]
List.max : List (Num a) -> Result (Num a) [ListWasEmpty]
List.join_map : List a, (a -> List b) -> List b
List.find_first : List elem, (elem -> Bool) -> Result elem [NotFound]
List.find_last : List elem, (elem -> Bool) -> Result elem [NotFound]
List.find_first_index : List elem, (elem -> Bool) -> Result U64 [NotFound]
List.find_last_index : List elem, (elem -> Bool) -> Result U64 [NotFound]
List.sublist : List elem, { start : U64, len : U64 } -> List elem
List.intersperse : List elem, elem -> List elem
List.starts_with : List elem, List elem -> Bool where elem implements Eq
List.ends_with : List elem, List elem -> Bool where elem implements Eq
List.split_at : List elem, U64 -> { before : List elem, others : List elem }
List.split_on : List a, a -> List (List a) where a implements Eq
List.split_on_list : List a, List a -> List (List a) where a implements Eq
List.split_first : List elem, elem -> Result { before : List elem, after : List elem } [NotFound] where elem implements Eq
List.split_last : List elem, elem -> Result { before : List elem, after : List elem } [NotFound] where elem implements Eq
List.chunks_of : List a, U64 -> List (List a)
List.map_try : List elem, (elem -> Result ok err) -> Result (List ok) err
List.map_try! : List elem, (elem => Result ok err) => Result (List ok) err
List.walk_try : List elem, state, (state, elem -> Result state err) -> Result state err
List.concat_utf8 : List U8, Str -> List U8
List.for_each! : List a, (a => {}) => {}
List.for_each_try! : List a, (a => Result {} err) => Result {} err
List.walk! : List elem, state, (state, elem => state) => state
List.walk_try! : List elem, state, (state, elem => Result state err) => Result state err
Dict.empty : {} -> Dict * *
Dict.with_capacity : U64 -> Dict * *
Dict.reserve : Dict k v, U64 -> Dict k v
Dict.release_excess_capacity : Dict k v -> Dict k v
Dict.capacity : Dict * * -> U64
Dict.single : k, v -> Dict k v
Dict.from_list : List ( k, v ) -> Dict k v
Dict.len : Dict * * -> U64
Dict.is_empty : Dict * * -> Bool
Dict.clear : Dict k v -> Dict k v
Dict.map : Dict k a, (k, a -> b) -> Dict k b
Dict.join_map : Dict a b, (a, b -> Dict x y) -> Dict x y
Dict.walk : Dict k v, state, (state, k, v -> state) -> state
Dict.walk_until : Dict k v, state, (state, k, v -> [ Continue state, Break state ]) -> state
Dict.keep_if : Dict k v, ( ( k, v ) -> Bool) -> Dict k v
Dict.drop_if : Dict k v, ( ( k, v ) -> Bool) -> Dict k v
Dict.get : Dict k v, k -> Result v [KeyNotFound]
Dict.contains : Dict k v, k -> Bool
Dict.insert : Dict k v, k, v -> Dict k v
Dict.remove : Dict k v, k -> Dict k v
Dict.update : Dict k v, k, (Result v [Missing] -> Result v [Missing]) -> Dict k v
Dict.to_list : Dict k v -> List ( k, v )
Dict.keys : Dict k v -> List k
Dict.values : Dict k v -> List v
Dict.insert_all : Dict k v, Dict k v -> Dict k v
Dict.keep_shared : Dict k v, Dict k v -> Dict k v where v implements Eq
Dict.remove_all : Dict k v, Dict k v -> Dict k v
Set.empty : {} -> Set *
Set.with_capacity : U64 -> Set *
Set.reserve : Set k, U64 -> Set k
Set.release_excess_capacity : Set k -> Set k
Set.single : k -> Set k
Set.insert : Set k, k -> Set k
Set.len : Set * -> U64
Set.capacity : Set * -> U64
Set.is_empty : Set * -> Bool
Set.remove : Set k, k -> Set k
Set.contains : Set k, k -> Bool
Set.to_list : Set k -> List k
Set.from_list : List k -> Set k
Set.union : Set k, Set k -> Set k
Set.intersection : Set k, Set k -> Set k
Set.difference : Set k, Set k -> Set k
Set.walk : Set k, state, (state, k -> state) -> state
Set.map : Set a, (a -> b) -> Set b
Set.join_map : Set a, (a -> Set b) -> Set b
Set.walk_until : Set k, state, (state, k -> [ Continue state, Break state ]) -> state
Set.keep_if : Set k, (k -> Bool) -> Set k
Set.drop_if : Set k, (k -> Bool) -> Set k
Decode.DecodeError : [TooShort]
Decode.Decoding : implements
    decoder : Decoder val fmt
        where val implements Decoding, fmt implements DecoderFormatting
Decode.custom : (List U8, fmt -> DecodeResult val) -> Decoder val fmt where fmt implements DecoderFormatting
Decode.decode_with : List U8, Decoder val fmt, fmt -> DecodeResult val where fmt implements DecoderFormatting
Decode.from_bytes_partial : List U8, fmt -> DecodeResult val where val implements Decoding, fmt implements DecoderFormatting
Decode.from_bytes : List U8, fmt -> Result val [Leftover (List U8)]DecodeError where val implements Decoding, fmt implements DecoderFormatting
Decode.map_result : DecodeResult a, (a -> b) -> DecodeResult b
Encode.Encoding : implements
    to_encoder : val -> Encoder fmt
        where val implements Encoding, fmt implements EncoderFormatting
Encode.custom : (List U8, fmt -> List U8) -> Encoder fmt where fmt implements EncoderFormatting
Encode.append_with : List U8, Encoder fmt, fmt -> List U8 where fmt implements EncoderFormatting
Encode.append : List U8, val, fmt -> List U8 where val implements Encoding, fmt implements EncoderFormatting
Encode.to_bytes : val, fmt -> List U8 where val implements Encoding, fmt implements EncoderFormatting
Hash.Hash : implements
    hash : hasher, a -> hasher
        where a implements Hash, hasher implements Hasher
Hash.Hasher : implements
    add_bytes : a, List U8 -> a
        where a implements Hasher
    add_u8 : a, U8 -> a
        where a implements Hasher
    add_u16 : a, U16 -> a
        where a implements Hasher
    add_u32 : a, U32 -> a
        where a implements Hasher
    add_u64 : a, U64 -> a
        where a implements Hasher
    add_u128 : a, U128 -> a
        where a implements Hasher
    complete : a -> U64
        where a implements Hasher
Hash.hash_bool : a, Bool -> a where a implements Hasher
Hash.hash_i8 : a, I8 -> a where a implements Hasher
Hash.hash_i16 : a, I16 -> a where a implements Hasher
Hash.hash_i32 : a, I32 -> a where a implements Hasher
Hash.hash_i64 : a, I64 -> a where a implements Hasher
Hash.hash_i128 : a, I128 -> a where a implements Hasher
Hash.hash_dec : a, Dec -> a where a implements Hasher
Box.box : a -> Box a
Box.unbox : Box a -> a
Inspect.KeyValWalker : collection, state, (state, key, val -> state) -> state
Inspect.ElemWalker : collection, state, (state, elem -> state) -> state
Inspect.custom : (f -> f) -> Inspector f where f implements InspectFormatter
Inspect.apply : Inspector f, f -> f where f implements InspectFormatter
Inspect.Inspect : implements
    to_inspector : val -> Inspector f
        where val implements Inspect, f implements InspectFormatter
Inspect.inspect : val -> f where val implements Inspect, f implements InspectFormatter
Inspect.to_str : val -> Str where val implements Inspect
```

The Docs website is: https://www.roc-lang.org/builtins/alpha4/
Examples are at: https://github.com/roc-lang/examples/tree/main/examples

### Roc Syntax Overview Demo

```
app [main!] { cli: platform "https://github.com/roc-lang/basic-cli/releases/download/0.20.0/X73hGh05nNTkDHU06FHC0YfFaQB1pimX7gncRcao5mU.tar.br" }

import cli.Stdout
import cli.Stdout as StdoutAlias
import cli.Arg exposing [Arg]
import "README.md" as readme : Str # You can also import as List U8

# Note 1: I tried to demonstrate all Roc syntax (possible in a single app file),
# but I probably forgot some things.

# Note 2: Lots of syntax patterns are better explained in their own dedicated example,
# see https://www.roc-lang.org/examples/ 

## Double hashtag for doc comment
number_operators : I64, I64 -> _
number_operators = |a, b|
    a_f64 = Num.to_f64(a)
    b_f64 = Num.to_f64(b)

    {
        # binary operators
        sum: a + b,
        diff: a - b,
        prod: a * b,
        div: a_f64 / b_f64,
        div_trunc: a // b,
        rem: a % b,
        eq: a == b,
        neq: a != b,
        lt: a < b,
        lteq: a <= b,
        gt: a > b,
        gteq: a >= b,
        # unary operators
        neg: -a,
        # the last item can have a comma too
    }

boolean_operators : Bool, Bool -> _
boolean_operators = |a, b| {
    bool_and: a && b,
    bool_and_keyword: a and b,
    bool_or: a || b,
    bool_or_keyword: a or b,
    not_a: !a,
}

pizza_operator : Str, Str -> Str
pizza_operator = |str_a, str_b|
    str_a |> Str.concat(str_b)

patterns : List U64 -> U64
patterns = |lst|
    when lst is
        [1, 2, ..] ->
            42

        [2, .., 1] ->
            24

        [] ->
            0

        [_head, .. as tail] if List.len(tail) > 7 ->
            List.len(tail)

        # Note: avoid using `_` in a when branch, in general you should
        # try to match all cases explicitly.
        _ ->
            100

string_stuff : Str
string_stuff =
    planet = "Venus"

    Str.concat(
        "Hello, ${planet}!",
        """
        This is a multiline string.
        You can call functions inside $... too: ${Num.to_str(1 + 1)}
        Unicode escape sequence: \u(00A0)
        """,
    )

pattern_match_tag_union : Result {} [StdoutErr(Str), Other] -> Str
pattern_match_tag_union = |result|
    # `Result a b` is the tag union `[Ok a, Err b]` under the hood.
    when result is
        Ok(_) ->
            "Success"

        Err(StdoutErr(err)) ->
            "StdoutErr: ${Inspect.to_str(err)}"

        Err(_) ->
            "Unknown error"

# end name with `!` for effectful functions
# `=>` shows effectfulness in the type signature
effect_demo! : Str => Result {} [StdoutErr _, StdoutLineFailed [StdoutErr _]]
effect_demo! = |msg|

    # `?` to return the error if there is one
    Stdout.line!(msg)?

    # ` ? ` for map_err
    Stdout.line!(msg) ? |err| StdoutLineFailed(err)
    # this also works:
    Stdout.line!(msg) ? StdoutLineFailed

    # ?? to provide default value
    Stdout.line!(msg) ?? {}

    # In rare cases, you can use `_ =` to ignore the result.
    # This allows you to avoid StdoutErr in the type signature.
    # Example of appropriate usage:
    # https://github.com/roc-lang/basic-webserver/blob/main/platform/main.roc
    _ = Stdout.line!(msg)

    Ok({})

dbg_expect : {} -> {}
dbg_expect = |{}|
    a = 42

    dbg a

    # dbg can forward what it receives
    b = dbg 43

    # inline expects get removed in optimized builds!
    expect b == 43

    {}

# Top level expect
expect 0 == 0

# Values that are defined inside a multi-line expect get printed on failure
expect
    expected = 43
    actual = 44
    
    actual == expected

if_demo : U64 -> Str
if_demo = |num|
    # every if must have an else branch!
    one_line_if = if num == 1 then "True" else "False"

    # multiline if
    if num == 2 then
        one_line_if
    else if num == 3 then
        "False"
    else
        "False"

tuple_demo : {} -> (Str, U32)
tuple_demo = |{}|
    # tuples can contain multiple types
    # they are allocated on the stack
    ("Roc", 1)

tag_union_demo : Str -> [Red, Green, Yellow]
tag_union_demo = |string|
    when string is
        "red" -> Red
        "green" -> Green
        # We can't list all possible strings, so we use `_` to match all other cases.
        _ -> Yellow

type_var_star : List * -> List _
type_var_star = |lst| lst

TypeWithTypeVar a : [
    TagOne,
    TagTwo Str,
]a

tag_union_advanced : Str -> TypeWithTypeVar [TagThree, TagFour U64]
tag_union_advanced = |string|
    when string is
        "one" -> TagOne
        "two" -> TagTwo("hello")
        "three" -> TagThree
        # We can't list all possible strings, so we use `_` to match all other cases.
        _ -> TagFour(42)

default_val_record : { a ?? Str } -> Str
default_val_record = |{ a ?? "default" }|
    a

destructuring =
    tup = ("Roc", 1)
    (str, num) = tup

    rec = { x: 1, y: tup.1 } # tuple access with `.index`
    { x, y } = rec

    (str, num, x, y)

record_update =
    rec = { x: 1, y: 2 }
    rec2 = { rec & y: 3 }
    rec2

record_access_func = .x

# You can pass a record with many more fields than just x and y.
open_record_arg_sum : { x: U64, y: U64 }* -> U64
open_record_arg_sum = |{ x, y }|
    x + y

number_literals =
    usage_based = 5
    explicit_u8 = 5u8
    explicit_i8 = 5i8
    explicit_u16 = 5u16
    explicit_i16 = 5i16
    explicit_u32 = 5u32
    explicit_i32 = 5i32
    explicit_u64 = 5u64
    explicit_i64 = 5i64
    explicit_u128 = 5u128
    explicit_i128 = 5i128
    explicit_f32 = 5.0f32
    explicit_f64 = 5.0f64
    explicit_dec = 5.0dec

    hex = 0x5
    octal = 0o5
    binary = 0b0101
    
    (usage_based, explicit_u8, explicit_i8, explicit_u16, explicit_i16, explicit_u32, explicit_i32, explicit_u64, explicit_i64, explicit_u128, explicit_i128, explicit_f32, explicit_f64, explicit_dec, hex, octal, binary)

# Using `where` ... `implements`
to_str : a -> Str where a implements Inspect
to_str = |value|
    Inspect.to_str(value)

# Opaque type
Username := Str

username_from_str : Str -> Username
username_from_str = |str|
    @Username(str)

username_to_str : Username -> Str
username_to_str = |@Username(str)|
    str

# Opaque type with derived abilities
StatsDB := Dict Str { score : Dec, average : Dec } implements [ Eq, Hash ]

# Custom implementation of an ability
Animal := [
        Dog Str,
        Cat Str,
    ]
    implements [
        Eq { is_eq: animal_equality },
    ]

animal_equality : Animal, Animal -> Bool
animal_equality = |@Animal(a), @Animal(b)|
    when (a, b) is
        (Dog(name_a), Dog(name_b)) | (Cat(name_a), Cat(name_b)) -> name_a == name_b
        _ -> Bool.false

# Defining a new ability
CustomInspect implements
    inspect_me : val -> Str where val implements CustomInspect

Color := [Red, Green]
    implements [
        Eq,
        CustomInspect {
            inspect_me: inspect_color,
        },
    ]

inspect_color : Color -> Str
inspect_color = \@Color color ->
    when color is
        Red -> "Red"
        Green -> "Green"

early_return = |arg|
    first =
        if !arg then
            return 99
        else
            "continue"

    # Do some other stuff
    Str.count_utf8_bytes(first)


record_builder_example =
    parser = { chain <-
        name: parse(Ok),
        age: parse(Str.to_u32),
        city: parse(Ok),
    } |> run
    
    parser("Alice-25-NYC")

# record builder helpers

Builder a := List Str -> Result (a, List Str) [Empty]

parse : (Str -> Result a [Empty]) -> Builder a
parse = |f| @Builder |segments|
    when segments is
        [] -> Err(Empty)
        [first, .. as rest] -> 
            when f(first) is
                Ok(value) -> Ok((value, rest))
                Err(_) -> Err(Empty)

chain : Builder a, Builder b, (a, b -> c) -> Builder c
chain = |@Builder(fa), @Builder(fb), combine|
    @Builder |segments|
        (a, rest1) = fa(segments)?
        (b, rest2) = fb(rest1)?
        Ok((combine(a, b), rest2))

run : Builder a -> (Str -> Result a [Empty])
run = |@Builder(f)| |input|
    segments = Str.split_on(input, "-")
    (result, _) = f(segments)?
    Ok(result)

# end record builder helpers

main! : List Arg => Result {} _
main! = |_args|
    ...
```

## basic-cli instructions

If you see this header at the top of a Roc file it is using basic-cli:
```
app [main!] { cli: platform "https://github.com/roc-lang/basic-cli/releases/download/0.20.0/X73hGh05nNTkDHU06FHC0YfFaQB1pimX7gncRcao5mU.tar.br" }
```
basic-cli supports these functions (require import):
```
Path.write! : val, Path, fmt => Result {} [FileWriteErr Path IOErr] where val implements Encoding, fmt implements EncoderFormatting
Path.write_bytes! : List U8, Path => Result {} [FileWriteErr Path IOErr]
Path.write_utf8! : Str, Path => Result {} [FileWriteErr Path IOErr]
Path.from_str : Str -> Path
Path.from_bytes : List U8 -> Path
Path.display : Path -> Str
Path.is_dir! : Path => Result Bool [PathErr IOErr]
Path.is_file! : Path => Result Bool [PathErr IOErr]
Path.is_sym_link! : Path => Result Bool [PathErr IOErr]
Path.exists! : Path => Result Bool [PathErr IOErr]
Path.type! : Path => Result [ IsFile, IsDir, IsSymLink ] [PathErr IOErr]
Path.with_extension : Path, Str -> Path
Path.delete! : Path => Result {} [FileWriteErr Path IOErr]
Path.read_utf8! : Path => Result Str [ FileReadErr Path IOErr, FileReadUtf8Err Path ]
Path.read_bytes! : Path => Result (List U8) [FileReadErr Path IOErr]
Path.list_dir! : Path => Result (List Path) [DirErr IOErr]
Path.delete_empty! : Path => Result {} [DirErr IOErr]
Path.delete_all! : Path => Result {} [DirErr IOErr]
Path.create_dir! : Path => Result {} [DirErr IOErr]
Path.create_all! : Path => Result {} [DirErr IOErr]
Path.hard_link! : Path, Path => Result {} [LinkErr IOErr]
Path.rename! : Path, Path => Result {} [PathErr IOErr]
Arg.to_os_raw : Arg -> [ Unix (List U8), Windows (List U16) ]
Arg.from_os_raw : [ Unix (List U8), Windows (List U16) ] -> Arg
Arg.display : Arg -> Str
Dir.list! : Str => Result (List Path) [DirErr IOErr]
Dir.delete_empty! : Str => Result {} [DirErr IOErr]
Dir.delete_all! : Str => Result {} [DirErr IOErr]
Dir.create! : Str => Result {} [DirErr IOErr]
Dir.create_all! : Str => Result {} [DirErr IOErr]
Env.cwd! : {} => Result Path [CwdUnavailable]
Env.set_cwd! : Path => Result {} [InvalidCwd]
Env.exe_path! : {} => Result Path [ExePathUnavailable]
Env.var! : Str => Result Str [VarNotFound Str]
Env.decode! : Str => Result val [ VarNotFound Str, DecodeErr DecodeError ] where val implements Decoding
Env.dict! : {} => Dict Str Str
Env.platform! : {} => { arch : ARCH, os : OS }
Env.temp_dir! : {} => Path
File.write! : val, Str, fmt => Result {} [FileWriteErr Path IOErr] where val implements Encoding, fmt implements EncoderFormatting
File.write_bytes! : List U8, Str => Result {} [FileWriteErr Path IOErr]
File.write_utf8! : Str, Str => Result {} [FileWriteErr Path IOErr]
File.delete! : Str => Result {} [FileWriteErr Path IOErr]
File.read_bytes! : Str => Result (List U8) [FileReadErr Path IOErr]
File.read_utf8! : Str => Result Str [ FileReadErr Path IOErr, FileReadUtf8Err Path ]
File.hard_link! : Str, Str => Result {} [LinkErr IOErr]
File.is_dir! : Str => Result Bool [PathErr IOErr]
File.is_file! : Str => Result Bool [PathErr IOErr]
File.is_sym_link! : Str => Result Bool [PathErr IOErr]
File.exists! : Str => Result Bool [PathErr IOErr]
File.is_executable! : Str => Result Bool [PathErr IOErr]
File.is_readable! : Str => Result Bool [PathErr IOErr]
File.is_writable! : Str => Result Bool [PathErr IOErr]
File.time_accessed! : Str => Result Utc [PathErr IOErr]
File.time_modified! : Str => Result Utc [PathErr IOErr]
File.time_created! : Str => Result Utc [PathErr IOErr]
File.rename! : Str, Str => Result {} [PathErr IOErr]
File.type! : Str => Result [ IsFile, IsDir, IsSymLink ] [PathErr IOErr]
File.open_reader! : Str => Result Reader [GetFileReadErr Path IOErr]
File.open_reader_with_capacity! : Str, U64 => Result Reader [GetFileReadErr Path IOErr]
File.read_line! : Reader => Result (List U8) [FileReadErr Path IOErr]
File.size_in_bytes! : Str => Result U64 [PathErr IOErr]
Http.default_request : Request
Http.header : ( Str, Str ) -> Header
Http.send! : Request => Result Response [ HttpErr [ Timeout, NetworkError, BadBody, Other (List U8) ] ]
Http.get! : Str, fmt => Result body [ HttpDecodingFailed, HttpErr ] where body implements Decoding, fmt implements DecoderFormatting
Http.get_utf8! : Str => Result Str [ BadBody Str, HttpErr ]
Stderr.line! : Str => Result {} [StderrErr IOErr]
Stderr.write! : Str => Result {} [StderrErr IOErr]
Stderr.write_bytes! : List U8 => Result {} [StderrErr IOErr]
Stdin.line! : {} => Result Str [ EndOfFile, StdinErr IOErr ]
Stdin.bytes! : {} => Result (List U8) [ EndOfFile, StdinErr IOErr ]
Stdin.read_to_end! : {} => Result (List U8) [StdinErr IOErr]
Stdout.line! : Str => Result {} [StdoutErr IOErr]
Stdout.write! : Str => Result {} [StdoutErr IOErr]
Stdout.write_bytes! : List U8 => Result {} [StdoutErr IOErr]
Tcp.connect! : Str, U16 => Result Stream (ConnectErr )
Tcp.read_up_to! : Stream, U64 => Result (List U8) [TcpReadErr StreamErr]
Tcp.read_exactly! : Stream, U64 => Result (List U8) [ TcpReadErr StreamErr, TcpUnexpectedEOF ]
Tcp.read_until! : Stream, U8 => Result (List U8) [TcpReadErr StreamErr]
Tcp.read_line! : Stream => Result Str [ TcpReadErr StreamErr, TcpReadBadUtf8 ]
Tcp.write! : Stream, List U8 => Result {} [TcpWriteErr StreamErr]
Tcp.write_utf8! : Stream, Str => Result {} [TcpWriteErr StreamErr]
Tcp.connect_err_to_str : ConnectErr -> Str
Tcp.stream_err_to_str : StreamErr -> Str
Url.reserve : Url, U64 -> Url
Url.from_str : Str -> Url
Url.to_str : Url -> Str
Url.append : Url, Str -> Url
Url.append_param : Url, Str, Str -> Url
Url.with_query : Url, Str -> Url
Url.query : Url -> Str
Url.has_query : Url -> Bool
Url.fragment : Url -> Str
Url.with_fragment : Url, Str -> Url
Url.has_fragment : Url -> Bool
Url.query_params : Url -> Dict Str Str
Url.path : Url -> Str
Utc.now! : {} => Utc
Utc.to_millis_since_epoch : Utc -> I128
Utc.from_millis_since_epoch : I128 -> Utc
Utc.to_nanos_since_epoch : Utc -> I128
Utc.from_nanos_since_epoch : I128 -> Utc
Utc.delta_as_millis : Utc, Utc -> U128
Utc.delta_as_nanos : Utc, Utc -> U128
Utc.to_iso_8601 : Utc -> Str
Sleep.millis! : U64 => {}
Cmd.exec! : Str, List Str => Result {} [ ExecFailed { command : Str, exit_code : I32 }, FailedToGetExitCode { command : Str, err : IOErr } ]
Cmd.exec_cmd! : Cmd => Result {} [ ExecCmdFailed { command : Str, exit_code : I32 }, FailedToGetExitCode { command : Str, err : IOErr } ]
Cmd.exec_output! : Cmd => Result { stdout_utf8 : Str, stderr_utf8_lossy : Str } [ StdoutContainsInvalidUtf8 { cmd_str : Str, err : [ BadUtf8 { index : U64, problem : Str.Utf8Problem } ] }, NonZeroExitCode { command : Str, exit_code : I32, stdout_utf8_lossy : Str, stderr_utf8_lossy : Str }, FailedToGetExitCode { command : Str, err : IOErr } ]
Cmd.exec_output_bytes! : Cmd => Result { stderr_bytes : List U8, stdout_bytes : List U8 } [ FailedToGetExitCodeB InternalIOErr.IOErr, NonZeroExitCodeB { exit_code : I32, stderr_bytes : List U8, stdout_bytes : List U8 } ]
Cmd.exec_exit_code! : Cmd => Result I32 [ FailedToGetExitCode { command : Str, err : IOErr } ]
Cmd.env : Cmd, Str, Str -> Cmd
Cmd.envs : Cmd, List ( Str, Str ) -> Cmd
Cmd.clear_envs : Cmd -> Cmd
Cmd.new : Str -> Cmd
Cmd.arg : Cmd, Str -> Cmd
Cmd.args : Cmd, List Str -> Cmd
Tty.enable_raw_mode! : {} => {}
Tty.disable_raw_mode! : {} => {}
Locale.get! : {} => Result Str [NotAvailable]
Locale.all! : {} => List Str
Sqlite.prepare! : { path : Str, query : Str } => Result Stmt [SqliteErr ErrCode Str]
Sqlite.execute! : { path : Str, query : Str, bindings : List Binding } => Result {} [ SqliteErr ErrCode Str, RowsReturnedUseQueryInstead ]
Sqlite.execute_prepared! : { stmt : Stmt, bindings : List Binding } => Result {} [ SqliteErr ErrCode Str, RowsReturnedUseQueryInstead ]
Sqlite.query! : { path : Str, query : Str, bindings : List Binding, row : SqlDecode a (RowCountErr err) } => Result a (SqlDecodeErr (RowCountErr err))
Sqlite.query_prepared! : { stmt : Stmt, bindings : List Binding, row : SqlDecode a (RowCountErr err) } => Result a (SqlDecodeErr (RowCountErr err))
Sqlite.query_many! : { path : Str, query : Str, bindings : List Binding, rows : SqlDecode a err } => Result (List a) (SqlDecodeErr err)
Sqlite.query_many_prepared! : { stmt : Stmt, bindings : List Binding, rows : SqlDecode a err } => Result (List a) (SqlDecodeErr err)
Sqlite.decode_record : SqlDecode a err, SqlDecode b err, (a, b -> c) -> SqlDecode c err
Sqlite.map_value : SqlDecode a err, (a -> b) -> SqlDecode b err
Sqlite.map_value_result : SqlDecode a err, (a -> Result c (SqlDecodeErr err)) -> SqlDecode c err
Sqlite.tagged_value : Str -> SqlDecode Value []
Sqlite.str : Str -> SqlDecode Str UnexpectedTypeErr
Sqlite.bytes : Str -> SqlDecode (List U8) UnexpectedTypeErr
Sqlite.i64 : Str -> SqlDecode I64 [FailedToDecodeInteger []]UnexpectedTypeErr
Sqlite.i32 : Str -> SqlDecode I32 [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.i16 : Str -> SqlDecode I16 [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.i8 : Str -> SqlDecode I8 [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.u64 : Str -> SqlDecode U64 [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.u32 : Str -> SqlDecode U32 [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.u16 : Str -> SqlDecode U16 [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.u8 : Str -> SqlDecode U8 [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.f64 : Str -> SqlDecode F64 [FailedToDecodeReal []]UnexpectedTypeErr
Sqlite.f32 : Str -> SqlDecode F32 [FailedToDecodeReal []]UnexpectedTypeErr
Sqlite.Nullable : [ NotNull a, Null ]
Sqlite.nullable_str : Str -> SqlDecode (Nullable Str) UnexpectedTypeErr
Sqlite.nullable_bytes : Str -> SqlDecode (Nullable (List U8)) UnexpectedTypeErr
Sqlite.nullable_i64 : Str -> SqlDecode (Nullable I64) [FailedToDecodeInteger []]UnexpectedTypeErr
Sqlite.nullable_i32 : Str -> SqlDecode (Nullable I32) [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.nullable_i16 : Str -> SqlDecode (Nullable I16) [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.nullable_i8 : Str -> SqlDecode (Nullable I8) [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.nullable_u64 : Str -> SqlDecode (Nullable U64) [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.nullable_u32 : Str -> SqlDecode (Nullable U32) [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.nullable_u16 : Str -> SqlDecode (Nullable U16) [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.nullable_u8 : Str -> SqlDecode (Nullable U8) [FailedToDecodeInteger [OutOfBounds]]UnexpectedTypeErr
Sqlite.nullable_f64 : Str -> SqlDecode (Nullable F64) [FailedToDecodeReal []]UnexpectedTypeErr
Sqlite.nullable_f32 : Str -> SqlDecode (Nullable F32) [FailedToDecodeReal []]UnexpectedTypeErr
Sqlite.errcode_to_str : ErrCode -> Str
```
The basic-cli Docs website is: https://roc-lang.github.io/basic-cli/0.20.0/
Examples are at: https://github.com/roc-lang/basic-cli/tree/0.20.0/examples
